#!/usr/bin/env node
import { exit } from "node:process";

import { RequestFailed, UsageError } from "./errors.js";
import { run } from "./cli.js";

run()
  .then((code) => exit(code))
  .catch((error) => {
    if (error instanceof UsageError || error instanceof RequestFailed) {
      console.error(error.message);
      exit(error.exitCode);
    }
    console.error(error);
    exit(1);
  });
