#! /usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { Command } = require('commander');
const AdmZip = require('adm-zip');
const promptly = require('promptly');
const _ = require('lodash');
const tar = require('tar');

const program = new Command();
const zip = new AdmZip();

function VShell() {
    this.image = null;
    this.root = null;
    this.dir = null;

    this.setImage = (imagePath) => {
        if (!fs.existsSync(imagePath)) {
            console.log('ERROR: image entry does not exist\n');
            return false;
        }

        const extension = (/\.(zip|tar)+$/i).exec(imagePath);
        if (!extension) {
            console.log('ERROR: image entry has wrong extension\n');
            return false;
        }

        this.image = {
            ext: extension[0],
            entry: new AdmZip(imagePath),
        };
        this.root = (/[A-Z]+(?=.(zip|tar)$)/i).exec(imagePath)[0];
        this.dir = this.root;

        return true;
    }

    this.printWorkingDirectory = () => {
        if (!this.image) {
            console.log('ERROR: image is not defined');
            return;
        }

        const path = this.dir + (this.dir == this.root ? '(root)' : '');
        console.log(path);
    }

    this.getWorkingDirectory = () => {
        return this.dir;
    }

    this.list = (listPath) => {
        if (!this.image) {
            console.log('ERROR: image is not defined');
            return;
        }

        if (listPath) {
            let temp = this.dir;

            let entries = this.image.entry.getEntries();
            const newDir = path.join(this.dir, listPath).replace(/\\/g, '/');
            let exists = false;
            entries.forEach((entry) => {
                if (new RegExp(`^${newDir}`).test(entry.entryName) && entry.isDirectory) {
                    this.dir = newDir;
                    exists = true;
                }
            });
            if (!exists) {
                console.log('ERROR: path is non existent');
                return;
            }

            entries = this.image.entry.getEntries();
            const validator = new RegExp(`(?<=${this.dir}/)[A-Z0-9.]+/?$`, 'i');
            let unique = new Set();
            entries.forEach((entry) => {
                const e = validator.exec(entry.entryName);
                if (e) {
                    unique.add(e[0]);
                }
            });
            console.log(_.join([...unique.values()], ' '));
            this.dir = temp;
            return;
        }

        const entries = this.image.entry.getEntries();
        const validator = new RegExp(`(?<=${this.dir}/)[A-Z0-9.]+/?$`, 'i');
        let unique = new Set();
        entries.forEach((entry) => {
            const e = validator.exec(entry.entryName);
            if (e) {
                unique.add(e[0]);
            }
        });
        console.log(_.join([...unique.values()], ' '));
    }

    this.changedirectory = (newPath) => {
        if (!this.image) {
            console.log('ERROR: image is not defined');
            return;
        }

        if (!newPath) {
            console.log('ERROR: provide path');
            return;
        }

        if (newPath == '.' || newPath == '/') {
            console.log(this.dir);
            return;
        }

        if (!(/^(\/?[^\/ ]+)+\/?$/.test(newPath))) {
            console.log('ERROR: incorrect entry');
            return;
        }

        if (newPath == '..') {
            if (this.dir == this.root) {
                console.log(this.dir);
                return;
            }
            let segments = this.dir.split('/');
            let temp = _.join(segments.slice(0, segments.length - 1), '/');
            this.dir = temp;
            console.log(this.dir);
            return;
        }

        const entries = this.image.entry.getEntries();
        const newDir = path.join(this.dir, newPath).replace(/\\/g, '/');
        let exists = false;
        entries.forEach((entry) => {
            if (new RegExp(`^${newDir + '/'}`).test(entry.entryName) && entry.isDirectory) {
                this.dir = newDir;
                console.log(newDir);
                exists = true;
                return;
            }
        });

        if (!exists) {
            console.log('ERROR: incorrect entry');
        }
    }

    this.concatenate = (filePath) => {
        if (!this.image) {
            console.log('ERROR: image is not defined');
            return;
        }

        const entries = this.image.entry.getEntries();
        const fullPath = path.join(this.dir, filePath).replace(/\\/g, '/');

        let exists = false;
        entries.forEach((entry) => {
            if (entry.entryName == fullPath) {
                if (entry.isDirectory) {
                    console.log("ERROR: entry is not a file");
                    return;
                }
                console.log(this.image.entry.readAsText(entry));
                exists = true;
            }
        });

        if (!exists) {
            console.log("ERROR: file does not exist");
        }
    }

    this.processCommand = (args, onQuit) => {
        if (!args) {
            return;
        }

        switch (args[0]) {
            case 'pwd':
                vs.printWorkingDirectory();
                break;
            case 'ls':
                vs.list(args[1]);
                break;
            case 'cd':
                vs.changedirectory(args[1]);
                break;
            case 'cat':
                vs.concatenate(args[1]);
                break;
            case 'quit':
                onQuit();
                break;
            default:
                console.log(`ERROR: ${args[0]} command does not exist`);
                break;
        }
    }

    this.executeScript = (script) => {
        if (!fs.existsSync(script)) {
            console.log('ERROR: script file does not exist');
            return;
        }

        try {
            const data = fs.readFileSync(script, 'utf8');
            data.split('\r\n').forEach((command) => this.processCommand(command.split(' ')));
        } catch (err) {
            console.log(err.message);
        }
    }

    this.test = () => {
        this.printWorkingDirectory();
        this.list();
        this.list('subDir1');
        this.changedirectory('subDir1');
        this.concatenate('text1.txt');
    }
}

const vs = new VShell();

program
    .name("vshell")
    .version('1.0.0')
    .argument('<imagePath>', 'path to image (.zip, .tar)')
    .option('-s, --script [path]', 'path to script', null)
    .action(async (imagePath, options) => {
        if (!vs.setImage(imagePath)) {
            return;
        }

        if (options.script) {
            vs.executeScript(options.script);
        }

        let isActive = true;
        while (isActive) {
            const nextCommand = await promptly.prompt(`VSHELL[${vs.getWorkingDirectory()}]>>`);
            const args = _.split(nextCommand, ' ');

            vs.processCommand(args, () => isActive = false);
        }
    });

program.parse();