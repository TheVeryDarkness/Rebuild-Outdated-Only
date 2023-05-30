import { Command, program } from "commander";
import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { chdir } from "node:process";

type Task = {
  command: string;
  input: string[];
  output: string[];
};
type Config = {
  final: string[];
  tasks: Task[];
};

async function main(program: Command) {
  const TRACING_UNEXISTED = false;
  const TRACING_SKIPPING = false;
  const TRACING_UP_TO_DATE = false;
  const TRACING_TASK = false;
  const TRACING_SUCCESS = false;
  const TRACING_TIME_STAMPS = false;
  const now = Date.now().valueOf();
  function getTimeStamp(path: Readonly<string>): null | number {
    if (!existsSync(path)) {
      if (TRACING_UNEXISTED) console.log(`${path} does not exist.`);
      return null;
    }
    const status = statSync(path);
    if (!status.isFile) {
      throw new Error(`${path} is not a file.`);
    }
    return status.mtime.valueOf();
  }
  function getTimeStampForced(
    path: Readonly<string>,
    error: Readonly<string>
  ): never | number {
    const t = getTimeStamp(path);
    if (!t) throw new Error(error);
    return t;
  }

  function checkTimeStamps(task: Task) {
    const t = JSON.stringify(task);
    const timeInput = task.input.map((f) =>
      getTimeStampForced(f, `Input of "${t}" does not exist.`)
    );
    const timeOutput = task.output.map((f) =>
      getTimeStampForced(f, `Output of "${t}" does not exist.`)
    );
    const latestInput = Math.max(...timeInput);
    const earliestOutput = Math.min(...timeOutput);
    if (latestInput >= earliestOutput)
      throw new Error(`File time seems not to be refreshed. Check "${t}".`);
  }
  function recordTimeStamp(tasks: ReadonlyArray<Task>) {
    const timeStamps: Map<string, Date> = new Map();
    tasks.forEach((task: Readonly<Task>) => {
      const I = new Map<string, Date>();
      const O = new Map<string, Date>();
      function r(arr: ReadonlyArray<string>, map: Map<string, Date>) {
        return arr.forEach((i) => {
          if (existsSync(i)) {
            const t = statSync(i).mtime;
            if (t) timeStamps.set(i, t), map.set(i, t);
          }
        });
      }
      r(task.input, I);
      r(task.output, O);
      // console.log(I, O);
    });
    console.log(timeStamps);
  }
  function buildOutputTable(
    tasks: ReadonlyArray<Task>
  ): Map<string, Readonly<Task>> {
    const map = new Map<string, Readonly<Task>>();
    for (const task of tasks) {
      for (const output of task.output) {
        if (map.has(output)) {
          throw new Error(
            `Multiple tasks generating the same output "${output}".`
          );
        }
        map.set(output, task);
      }
    }
    return map;
  }
  const tasksBeenRun = new Set<Task>();
  function runTask(
    target: Readonly<string>,
    tasks: ReadonlyMap<string, Readonly<Task>>
  ): boolean {
    const task = tasks.get(target);
    if (!task) {
      if (existsSync(target)) {
        // Existed
        if (TRACING_SKIPPING)
          console.log(`${target} exists and has no rule to build. Skipped.`);
        return false;
      }
      throw new Error(`No task to build "${target}".`);
    }

    if (TRACING_TASK) {
      console.log(task);
    }
    try {
      const input: ReadonlyArray<string> = task.input;
      const output: ReadonlyArray<string> = task.output;
      const timeInput = input.map((i): number => {
        runTask(i, tasks);
        const I = getTimeStamp(i);
        if (!I) {
          throw new Error(
            `Running ${JSON.stringify(tasks.get(i))} can't build "${i}".`
          );
        }

        return I;
      });
      const latestInput = Math.max(...timeInput);
      const timeOutput = output.map((i): number => {
        return getTimeStamp(i) || 0;
      });
      const earliestOutput = Math.min(...timeOutput);
      if (latestInput >= earliestOutput) {
        if (tasksBeenRun.has(task)) {
          console.error("Task", task, "is re-run.");
        }
        try {
          const buf = execSync("pnpm exec " + task.command, {
            encoding: "utf8",
            stdio: "inherit",
          });
          buf && process.stdout.write(buf);
        } catch (err: any) {
          console.error(`Error during running "${task.command}":`);
          // if (err?.stdout) console.error(err?.stdout);
          // if (err?.stderr) console.error(err?.stderr);
          throw err;
        }
        checkTimeStamps(task);
        tasksBeenRun.add(task);
        if (TRACING_SUCCESS) {
          console.log(`Built`, target, `with`, task.command, `.`);
        }
        return true;
      } else {
        if (TRACING_UP_TO_DATE) {
          console.log(
            `Already up to date. "${
              input[timeInput.findIndex((i) => i == latestInput)]
            }:${latestInput}" < "${
              output[timeOutput.findIndex((i) => i == earliestOutput)]
            }":${earliestOutput}.`
          );
        }
        return false;
        // Up to date
      }
    } catch (error) {
      console.error(`During building ${target} with "${task.command}".`);
      throw error;
    }
  }

  const input: string = program.getOptionValue("input");
  const dirs: string[] = program.getOptionValue("directory");
  for (const dir of dirs) {
    const abs_dir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    const abs = path.join(abs_dir, input);
    const imported = await import("file:///" + abs);
    const mod = imported.default;
    if (!mod) console.error(`No default export in ${abs}.`);
    const cfg: Config = typeof mod === "function" ? mod() : mod;
    // console.log(JSON.stringify(cfg, null, 1));
    /*
    function pre(s: string) {
      return path.join(abs_dir, s);
    }
    */
    const final = cfg.final;
    if (!final || !(final instanceof Array) || final.length === 0) {
      throw new Error(`Configuration has no final: ${JSON.stringify(cfg)}`);
    }
    const tasks = cfg.tasks;
    if (TRACING_TIME_STAMPS) recordTimeStamp(tasks);
    const mapping = buildOutputTable(tasks);

    const beenRun = final.map((f) => {
      const cwd = process.cwd();
      chdir(abs_dir);
      const task = mapping.get(f);
      if (!task) {
        throw new Error(`No task to build "${f}" in final outputs.`);
      }
      const res = runTask(f, mapping);
      chdir(cwd);
      return res;
    });
    if (TRACING_TIME_STAMPS) recordTimeStamp(tasks);
    if (beenRun.every((x) => x == false))
      console.log(`Project ${dir} already up to date.`);
  }
}
program
  .version("0.0.0")
  .option("-i, --input <input>", "Name of configuration file.", "build.js")
  .option("-d, --directory [dirs...]", "Paths of projects root.", ["./"])
  .parse(process.argv);
main(program);
