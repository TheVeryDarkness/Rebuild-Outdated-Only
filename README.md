# Rebuild Outdated Only

Sometimes you may find `build` script always build everything in the project and it costs a lot of time.

You may want to use Makefile or Ninja, but both of them aren't in js, so every developer must install them manually.

This is a package trying to supply what Ninja supplies by js (though haven't), and I hope this is what you need.

## Usage

### Configuration

First, you need write a configuration script that exports configuration object as default.

```typescript
export default {
  final: ["lib/index.js"],
  tasks: [
    {
      input: ["src/index.ts"],
      output: ["lib/index.js"],
      command: "tsc -p tsconfig.json",
    },
  ],
};
```

As for the paths and commands, there are several tips:

- All paths are resolved as relative paths from root directory.
- All commands are executed after `pnpm exec`. Therefore local-installed package can be used.
- All paths and commands are recongnized from the root directory.
- Take care of your commands. This package won't check them.

### Execution

You can run `rebuild-outdated-only --help` for help, it will show help information as below:

```
Usage: rebuild-outdated-only [options]

Options:
  -V, --version              output the version number
  -i, --input <input>        Name of configuration file. (default: "build.js")
  -d, --directory [dirs...]  Paths of projects root. (default: ["./"])
  -h, --help                 display help for command
```

You may fill the codes below and put it into your **package.json** as a script:

```shell
rebuild-outdated-only -i "Relative path of configuration script from each directory" -d "Relative path of each directory from current directory"...
```

For example, you can write this:

```shell
rebuild-outdated-only -i build.js -d project-1 project-2
```

## TODO

- Asynchronous building.
- Strict type check for build.js.
