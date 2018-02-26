'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RelativePattern } from 'vscode';
import * as glob from 'glob';

function getConfigIndexForPlatform(configurations: any): number {
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
        })
    });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vscode-headers" is now active!');

    vscode.languages.registerCompletionItemProvider('cpp', {

        async provideCompletionItems(document, position, token) {
            // Open VsCode file
            let folders = vscode.workspace.workspaceFolders;
            if (folders === undefined) {
                return null;
            }

            if (document.lineAt(position.line).text.indexOf("#include") === -1) {
                return null;
            }

            let cppFilesLarge = await Promise.all(folders.map(async wp => {
                let relPatern = new RelativePattern(wp, "**/c_cpp_properties.json");
                let files = await vscode.workspace.findFiles(relPatern);
                if (files.length < 1) {
                    return Array<string>();
                }

                let retVals : string[] = new Array<string>();

                // TODO: Figure out current config

                for (let file of files) {
                    let content = await readFileAsync(file.fsPath);
                    let parsed = JSON.parse(content);
                    let configNum = getConfigIndexForPlatform(parsed.configurations);
                    let config = parsed.configurations[configNum];
                    for (let path of config.includePath) {
                        let newPath : string = path.replace("${workspaceRoot}", wp.uri.fsPath);
                        retVals.push(newPath);
                    }
                }

                return retVals;
            }));

            var paths : string[] = [].concat.apply([], cppFilesLarge);

            let args : vscode.CompletionItem[] = new Array<vscode.CompletionItem>();
            for (let p of paths) {
                let newPath = path.normalize(p);
                var dirs = await getFilesInDirectory(newPath);
                for (let d of dirs) {
                    //console.log(d);
                    args.push(new vscode.CompletionItem(d) );
                }
            }
            return args;
        }
    }, "<", "\"");

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
        // The code you place here will be executed every time your command is executed

        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
