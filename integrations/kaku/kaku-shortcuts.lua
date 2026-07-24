-- Kaku Lua Shortcuts for ChatGPT Harness
local kaku = require("kaku")
local config = {}

config.keys = {
  { key = "C", mods = "CMD|SHIFT", action = kaku.action.SpawnCommandInNewTab({ args = { "bun", "run", os.getenv("HOME") .. "/kaku-chatgpt-harness/apps/harnessctl/src/cli.ts", "connect", "chatgpt" } }) },
  { key = "S", mods = "CMD|SHIFT", action = kaku.action.SpawnCommandInNewTab({ args = { "bun", "run", os.getenv("HOME") .. "/kaku-chatgpt-harness/apps/harnessctl/src/cli.ts", "status" } }) },
  { key = "D", mods = "CMD|SHIFT", action = kaku.action.SpawnCommandInNewTab({ args = { "bun", "run", os.getenv("HOME") .. "/kaku-chatgpt-harness/apps/harnessctl/src/cli.ts", "doctor" } }) },
}

return config
