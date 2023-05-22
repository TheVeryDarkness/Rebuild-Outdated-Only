import { program } from "commander";
import { appendFile, stat } from "node:fs/promises";
import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { exit } from "node:process";

type Task = {
  command: string;
  input: string[];
  output: string[];
};
type Config = {
  final: string;
  tasks: Task[];
};

async function getTimeStamp(path: string) {
  const status = await stat(path);
  if (!status.isFile) console.error(`${path} is not a file.`);
  return status.mtime.valueOf();
}
async function getTimeStamps(paths: string[]) {
  try {
    return Promise.all(paths.map(getTimeStamp));
  } catch (e) {
    return null;
  }
}
async function runTask(task: Task): Promise<boolean> {
  const input = task.input;
  const output = task.output;
  const tsInput = await getTimeStamps(input);
  if (!tsInput) return false;
  const tsOutput = await getTimeStamps(output);
  // console.log(tsInput, input);
  // console.log(tsOutput, output);
  if (!tsOutput || Math.max(...tsInput) >= Math.min(...tsOutput)) {
    try {
      const child = await promisify(exec)(task.command);
      const out = child.stdout;
      const err = child.stderr;
      out && process.stdout.write(out);
      err && process.stderr.write(err);
    } catch (err) {
      console.error(err);
      await appendFile("build.err", JSON.stringify(err, null, 2));
      return false;
    }
  } else {
    // console.log("Skipped.");
  }
  return true;
}

program
  .version("0.0.0")
  .option("-i, --input <input>", "Input decription file.", "build.js")
  .parseAsync(process.argv)
  .then(async (program) => {
    const input = program.getOptionValue("input");
    const abs = path.isAbsolute(input)
      ? input
      : path.join(process.cwd(), input);
    const mod = (await import("file:///" + abs)).default;
    const cfg: Config = typeof mod === "function" ? mod() : mod;
    // console.log(JSON.stringify(cfg, null, 1));
    const final = cfg.final;
    const tasks = cfg.tasks;
    const built = new Set<string>();
    for (var i = 0; i < tasks.length; ++i) {
      const runable = await Promise.all(tasks.map(runTask));
      if (!runable.includes(false)) {
        // All done
        if (i == 0) process.stdout.write("Already up to date.");
        return;
      }
    }
    console.error("Failed to build.");
    exit(-1);
  });
