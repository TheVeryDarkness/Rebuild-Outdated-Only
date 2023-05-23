import { program } from "commander";
import { execSync } from "node:child_process";
import path from "node:path";
import { exit } from "node:process";
import { existsSync, statSync } from "node:fs";
import { assert } from "node:console";

type Task = {
  command: string;
  input: string[];
  output: string[];
};
type Config = {
  final: string;
  tasks: Task[];
};

function getTimeStamp(path: string): null | number {
  if (!existsSync(path)) return null;
  const status = statSync(path);
  if (!status.isFile) console.error(`${path} is not a file.`);
  return status.mtime.valueOf();
}
function getTimeStamps(paths: string[]) {
  const stamps = paths.map(getTimeStamp);
  return stamps.includes(null) ? null : (stamps as number[]);
}
enum TaskResult {
  SUCCESS = 0,
  UP_TO_DATE,
  FAILED,
  LACK_DEPENDENCIES,
}
function succeed(result: TaskResult) {
  return result == TaskResult.SUCCESS || result == TaskResult.UP_TO_DATE;
}
function upToDate(result: TaskResult) {
  return result == TaskResult.UP_TO_DATE;
}
function runTask(task: Task): TaskResult {
  const input = task.input;
  const output = task.output;
  const tsInput = getTimeStamps(input);
  if (!tsInput) return TaskResult.LACK_DEPENDENCIES;
  const tsOutput = getTimeStamps(output);
  // console.log(tsInput, input);
  // console.log(tsOutput, output);
  if (!tsOutput || Math.max(...tsInput) >= Math.min(...tsOutput)) {
    try {
      const buf = execSync(task.command);
      buf && process.stdout.write(buf);
    } catch (err) {
      console.error(err);
      return TaskResult.FAILED;
    }
    return TaskResult.SUCCESS;
  } else {
    // console.log("Skipped.");
    return TaskResult.UP_TO_DATE;
  }
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
    const imported = await import("file:///" + abs);
    const mod = imported.default;
    const cfg: Config = typeof mod === "function" ? mod() : mod;
    // console.log(JSON.stringify(cfg, null, 1));
    const final = cfg.final;
    const tasks = cfg.tasks;
    const built = new Set<string>();
    assert(tasks instanceof Array);
    for (var i = 0; i < tasks.length; ++i) {
      const results = tasks.map(runTask);
      if (i == 0 && results.every(upToDate)) {
        console.log("Already up to date.");
        return;
      }
      if (results.every(succeed)) {
        console.log("Succeed.");
        return;
      }
    }
    console.error("Failed to build.");
    exit(-1);
  });
