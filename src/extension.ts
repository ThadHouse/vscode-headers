'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RelativePattern } from 'vscode';
import * as glob from 'glob';
import * as jsonc from 'jsonc-parser';

function getConfigIndexForPlatform(configurations: any): number {
    let config = vscode.workspace.getConfiguration("vscppheaders");

    let index = config.get<number>("selectConfigIndex");

    if (index >= 0 && index < configurations.length) {
        return index;
    }

    if (configurations.length > 3) {
        return configurations.length - 1; // Default to the last custom configuration.
    }
    let nodePlatform: NodeJS.Platform = process.platform;
    let plat: string = "";
    if (nodePlatform === 'linux') {
        plat = "Linux";
    } else if (nodePlatform === 'darwin') {
        plat = "Mac";
    } else if (nodePlatform === 'win32') {
        plat = "Win32";
    }
    for (let i: number = 0; i < configurations.length; i++) {
        if (configurations[i].name === plat) {
            return i;
        }
    }
    return configurations.length - 1;
}

function readFileAsync(file : string) : Promise<string> {
    return new Promise(function (resolve, reject) {
        fs.readFile(file, 'utf8', (error : NodeJS.ErrnoException, result : string) => {
            if (error) {
            reject(error);
            } else {
            resolve(result);
            }
        });
    });
}

function getFilesInDirectory(root: string) : Promise<string[]> {
    return new Promise(function (resolve, reject) {
        if (os.platform() === 'win32') {
            if (root.startsWith('/') || root.startsWith('\\')) {
                resolve(new Array<string>());
            }
        }

        glob("**/*.h", { nomount: true,  cwd: root},  (error: Error | null, result : string[]) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    let headers = new VsCodeHeaders();

    await headers.loadHeaders();

    let reloadCommand = vscode.commands.registerCommand('vscppheaders.reloadHeaders', async () => {
        await headers.loadHeaders();
    });

    let vscodeFileUpdatedWatcher = vscode.workspace.createFileSystemWatcher("**/c_cpp_properties.json");

    vscodeFileUpdatedWatcher.onDidChange(async () => {
        await headers.loadHeaders();
    });

    let filesUpdatedWatcher = vscode.workspace.createFileSystemWatcher("**/*.{h, hpp, hh}", false, true, false);
    filesUpdatedWatcher.onDidCreate(async (f) => {
        await headers.loadHeaders();
    });

    filesUpdatedWatcher.onDidDelete(async (f) => {
        await headers.loadHeaders();
    });

    let disposable = vscode.languages.registerCompletionItemProvider(['cpp', 'c'], {

        provideCompletionItems(document, position, token) {
            if (document.lineAt(position.line).text.indexOf("#include") === -1) {
                return null;
            }

            return headers.getHeaders();
        }
    }, "<", "\"");

    context.subscriptions.push(headers);

    context.subscriptions.push(disposable);

    context.subscriptions.push(reloadCommand);

    context.subscriptions.push(filesUpdatedWatcher);
    context.subscriptions.push(vscodeFileUpdatedWatcher);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

class VsCodeHeaders {
    private headerFiles : string[] = new Array<string>();

    public getHeaders() : vscode.CompletionItem[] {
        let locs = new Array<vscode.CompletionItem>();
        for (let p of this.headerFiles) {
            locs.push(new vscode.CompletionItem(p));
        }
        return locs;
    }

    public async loadHeaders() {
        let folders = vscode.workspace.workspaceFolders;
        if (folders === undefined) {
            return null;
        }

        let config = vscode.workspace.getConfiguration("vscppheaders");

        let onlyWorkspaceHeaders = config.get<boolean>('onlyWorkspaceHeaders');

        let paths : string[] = new Array<string>();

        await Promise.all(folders.map(async wp => {
            let relPatern = new RelativePattern(wp, "**/c_cpp_properties.json");
            let files = await vscode.workspace.findFiles(relPatern);
            if (files.length < 1) {
                return;
            }

            for (let file of files) {
                let content = await readFileAsync(file.fsPath);
                let parsed = jsonc.parse(content);
                let configNum = getConfigIndexForPlatform(parsed.configurations);
                let config = parsed.configurations[configNum];
                for (let pth of config.includePath) {
                    if (onlyWorkspaceHeaders) {
                        if (pth.indexOf('${workspaceRoot}') === -1) {
                            continue;
                        }
                    }
                    let newPath : string = pth.replace("${workspaceRoot}", wp.uri.fsPath);
                    newPath = path.normalize(newPath);
                    let dirs = await getFilesInDirectory(newPath);
                    for (let d of dirs) {
                        paths.push(d);
                    }
                }
            }
        }));

        this.headerFiles = paths;
    }

    dispose() {

    }
}
