import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as tc from "@actions/tool-cache";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface CommandConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

async function downloadSqldef(command: string, version: string): Promise<string> {
    const platform = os.platform();
    const arch = os.arch();

    let osName = "";
    let archName = "";

    switch (platform) {
        case "linux":
            osName = "linux";
            break;
        case "darwin":
            osName = "darwin";
            break;
        case "win32":
            osName = "windows";
            break;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }

    switch (arch) {
        case "x64":
            archName = "amd64";
            break;
        case "arm64":
            archName = "arm64";
            break;
        default:
            throw new Error(`Unsupported architecture: ${arch}`);
    }

    const downloadUrl = `https://github.com/sqldef/sqldef/releases/download/${version}/${command}_${osName}_${archName}.tar.gz`;

    core.info(`Downloading ${command} ${version} from ${downloadUrl}`);

    const downloadPath = await tc.downloadTool(downloadUrl);
    const extractedPath = await tc.extractTar(downloadPath);

    const toolPath = await tc.cacheDir(extractedPath, command, version);
    const binaryPath = path.join(toolPath, command);

    await fs.promises.chmod(binaryPath, 0o755);

    return binaryPath;
}

function getCommandConfig(command: string): CommandConfig {
    const config: CommandConfig = {
        command: "",
        args: [],
        env: {},
    };

    const schemaFile = core.getInput("schema-file", { required: true });
    const configFile = core.getInput("config-file");

    switch (command) {
        case "psqldef": {
            const user = core.getInput("pg-user");
            const password = core.getInput("pg-password");
            const host = core.getInput("pg-host") || "localhost";
            const port = core.getInput("pg-port") || "5432";
            const database = core.getInput("pg-database");

            config.args.push("-h", host, "-p", port);
            if (user) config.args.push("-U", user);
            if (database) config.args.push(database);
            if (password) config.env = { ...config.env, PGPASSWORD: password };
            break;
        }
        case "mysqldef": {
            const user = core.getInput("mysql-user");
            const password = core.getInput("mysql-password");
            const host = core.getInput("mysql-host") || "localhost";
            const port = core.getInput("mysql-port") || "3306";
            const database = core.getInput("mysql-database");

            config.args.push("-h", host, "-P", port);
            if (user) config.args.push("-u", user);
            if (password) config.args.push(`-p${password}`);
            if (database) config.args.push(database);
            break;
        }
        case "sqlite3def": {
            const database = core.getInput("sqlite-database");
            if (database) config.args.push(database);
            break;
        }
        case "mssqldef": {
            const user = core.getInput("mssql-user");
            const password = core.getInput("mssql-password");
            const host = core.getInput("mssql-host") || "localhost";
            const port = core.getInput("mssql-port") || "1433";
            const database = core.getInput("mssql-database");

            config.args.push("-h", host, "-P", port);
            if (user) config.args.push("-U", user);
            if (password) config.args.push("-p", password);
            if (database) config.args.push(database);
            break;
        }
        default:
            throw new Error(`Unsupported command: ${command}`);
    }

    if (configFile) {
        config.args.push("--config", configFile);
    }

    config.args.push("--file", schemaFile);

    return config;
}

async function getSchemaFromBranch(branch: string, schemaFile: string): Promise<string> {
    const tempFile = path.join(os.tmpdir(), `schema-${branch}-${Date.now()}.sql`);

    await exec.exec("git", ["show", `${branch}:${schemaFile}`], {
        silent: true,
        listeners: {
            stdout: (data: Buffer) => {
                fs.appendFileSync(tempFile, data);
            },
        },
    });

    return tempFile;
}

async function runSqldef(binaryPath: string, config: CommandConfig): Promise<string> {
    let output = "";
    const args = [...config.args];

    const execEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
            execEnv[key] = value;
        }
    }
    Object.assign(execEnv, config.env);

    await exec.exec(binaryPath, args, {
        env: execEnv,
        silent: true,
        listeners: {
            stdout: (data: Buffer) => {
                output += data.toString();
            },
            stderr: (data: Buffer) => {
                output += data.toString();
            },
        },
    });

    return output;
}

async function createComment(body: string): Promise<void> {
    const context = github.context;

    if (context.eventName !== "pull_request") {
        core.warning("Not a pull request event, skipping comment");
        return;
    }

    const token = core.getInput("github-token") || process.env.GITHUB_TOKEN;
    if (!token) {
        core.warning("No GitHub token provided, skipping comment");
        return;
    }

    const octokit = github.getOctokit(token);

    const { data: comments } = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request!.number,
    });

    const title = "SQLDef Migration Preview";

    const previousComment = comments.find((comment) => comment.user?.type === "Bot" && comment.body?.includes(title));

    const commentBody = `
## ${title}

~~~sql
${body}
~~~

This comment was created by [sqldef-preview-action](https://github.com/sqldef/sqldef-preview-action).
`.trimStart();

    if (previousComment) {
        await octokit.rest.issues.updateComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: previousComment.id,
            body: commentBody,
        });
    } else {
        await octokit.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.pull_request!.number,
            body: commentBody,
        });
    }
}

async function run(): Promise<void> {
    try {
        const command = core.getInput("command", { required: true });
        const version = core.getInput("version") || "v3.0.0";
        const schemaFile = core.getInput("schema-file", { required: true });

        core.info(`Running SQLDef Preview with ${command} ${version}`);

        const binaryPath = await downloadSqldef(command, version);
        core.info(`Downloaded ${command} to ${binaryPath}`);

        const config = getCommandConfig(command);

        const context = github.context;

        if (context.eventName === "pull_request") {
            const baseBranch = context.payload.pull_request!.base.ref;

            core.info(`Fetching base branch: ${baseBranch}`);
            await exec.exec("git", ["fetch", "origin", baseBranch]);

            core.info("Getting baseline schema from base branch");
            const baselineSchemaFile = await getSchemaFromBranch(`origin/${baseBranch}`, schemaFile);

            const baselineConfig = { ...config };
            baselineConfig.args = baselineConfig.args.map((arg) => (arg === schemaFile ? baselineSchemaFile : arg));

            core.info("Applying baseline schema to database");
            await runSqldef(binaryPath, baselineConfig);

            core.info("Applying desired schema to database");
            const output = await runSqldef(binaryPath, config);

            if (output.trim()) {
                core.info("Schema changes detected:");
                core.info(output);
                await createComment(output);
            } else {
                core.info("No schema changes detected");
                await createComment("No schema changes detected.");
            }

            if (fs.existsSync(baselineSchemaFile)) {
                fs.unlinkSync(baselineSchemaFile);
            }
        } else {
            core.info("Applying with current schema");
            const output = await runSqldef(binaryPath, config);

            if (output.trim()) {
                core.info("Schema changes:");
                core.info(output);
            } else {
                core.info("No schema changes");
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

run();
