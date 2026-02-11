import { APP, type Shell, ShellSchema } from "./constants.ts";
import { SUPPORTED_PROVIDERS } from "./provider.ts";

const providers = SUPPORTED_PROVIDERS.join(" ");
const shells = APP.supportedShells.join(" ");
const name = APP.name;
const funcName = APP.name.replace(/-/g, "_");

/**
 * Generate shell completion scripts for the specified shell.
 *
 * Outputs a script that can be eval'd in the user's shell profile to enable
 * tab completion for all ai-pipe flags, providers, and options.
 *
 * Supported shells: bash, zsh, fish.
 *
 * @param shell - The shell name to generate completions for.
 * @returns The completion script as a string.
 *
 * @example
 * ```bash
 * # Add to ~/.bashrc:
 * eval "$(ai-pipe --completions bash)"
 * ```
 */
export function generateCompletions(shell: string): string {
  const result = ShellSchema.safeParse(shell);
  if (!result.success) {
    console.error(
      `Error: Unknown shell "${shell}". Supported shells: ${shells}. Example: ai-pipe --completions bash`,
    );
    process.exit(1);
  }

  const generators: Record<Shell, () => string> = {
    bash,
    zsh,
    fish,
  };

  return generators[result.data]();
}

function bash(): string {
  return `# ${name} bash completions
# Add to ~/.bashrc: eval "$(${name} --completions bash)"
_${funcName}_completions() {
  local cur prev opts providers subcommands config_subcommands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  opts="--model -m --system -s --role -r --roles --file -f --image -i --json -j --no-stream --no-cache --temperature -t --max-output-tokens --config -c --cost --markdown --chat --session -C --providers --completions --tools --mcp --no-update-check --version -V --help -h"
  providers="${providers}"
  subcommands="init config"
  config_subcommands="set show reset path"

  # Handle config subcommands
  if [[ "\${COMP_WORDS[1]}" == "config" ]]; then
    if [[ \${COMP_CWORD} -eq 2 ]]; then
      COMPREPLY=( $(compgen -W "\${config_subcommands}" -- "\${cur}") )
      return 0
    fi
    return 0
  fi

  case "\${prev}" in
    -m|--model)
      local models=""
      for p in \${providers}; do
        models="\${models} \${p}/"
      done
      COMPREPLY=( $(compgen -W "\${models}" -- "\${cur}") )
      compopt -o nospace
      return 0
      ;;
    -f|--file|-i|--image|--tools|--mcp)
      COMPREPLY=( $(compgen -f -- "\${cur}") )
      return 0
      ;;
    -c|--config)
      COMPREPLY=( $(compgen -d -- "\${cur}") )
      return 0
      ;;
    --completions)
      COMPREPLY=( $(compgen -W "${shells}" -- "\${cur}") )
      return 0
      ;;
    -C|--session|-s|--system|-r|--role|-t|--temperature|--max-output-tokens)
      return 0
      ;;
  esac

  if [[ \${cur} == -* ]]; then
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
  fi

  # Complete subcommands as first argument
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${subcommands}" -- "\${cur}") )
    return 0
  fi
}
complete -F _${funcName}_completions ${name}
complete -F _${funcName}_completions ai`;
}

function zsh(): string {
  return `# ${name} zsh completions
# Add to ~/.zshrc: eval "$(${name} --completions zsh)"
_${funcName}() {
  local -a providers subcommands config_subcommands
  providers=(${SUPPORTED_PROVIDERS.map((p) => `'${p}/'`).join(" ")})
  subcommands=('init:Run interactive setup wizard' 'config:Manage configuration')
  config_subcommands=('set:Set a config value' 'show:Show current config' 'reset:Reset config to defaults' 'path:Print config directory path')

  # Handle config subcommands
  if [[ "\${words[2]}" == "config" ]]; then
    if [[ \${CURRENT} -eq 3 ]]; then
      _describe -t commands 'config command' config_subcommands
      return 0
    fi
    return 0
  fi

  _arguments -s \\
    '(-m --model)'{-m,--model}'[Model in provider/model-id format]:model:->models' \\
    '(-s --system)'{-s,--system}'[System prompt]:prompt:' \\
    '(-r --role)'{-r,--role}'[Role name from roles directory]:role:' \\
    '--roles[List available roles]' \\
    '*'{-f,--file}'[Include file contents]:file:_files' \\
    '*'{-i,--image}'[Include image file (repeatable)]:file:_files' \\
    '(-j --json)'{-j,--json}'[Output full JSON response object]' \\
    '--no-stream[Wait for full response, then print]' \\
    '--no-cache[Disable response caching]' \\
    '(-t --temperature)'{-t,--temperature}'[Sampling temperature (${APP.temperature.min}-${APP.temperature.max})]:temp:' \\
    '--max-output-tokens[Maximum tokens to generate]:tokens:' \\
    '(-c --config)'{-c,--config}'[Path to config directory]:dir:_directories' \\
    '--cost[Show token usage and cost after response]' \\
    '--markdown[Render response as formatted markdown]' \\
    '--chat[Start interactive chat mode]' \\
    '(-C --session)'{-C,--session}'[Session name for conversation continuity]:session:' \\
    '--providers[List supported providers]' \\
    '--completions[Generate shell completions]:shell:(${shells})' \\
    '--tools[Path to tools configuration file (JSON)]:file:_files' \\
    '--mcp[Path to MCP server configuration file (JSON)]:file:_files' \\
    '--no-update-check[Disable update notifications]' \\
    '(-V --version)'{-V,--version}'[Print version]' \\
    '(-h --help)'{-h,--help}'[Print help]' \\
    '1:command:->subcmd' \\
    '*:prompt:' \\
    && return 0

  case "$state" in
    models)
      _describe -t providers 'provider' providers -S ''
      ;;
    subcmd)
      _describe -t commands 'command' subcommands
      ;;
  esac
}
compdef _${funcName} ${name}
compdef _${funcName} ai`;
}

function fish(): string {
  return `# ${name} fish completions
# Add to ~/.config/fish/completions/${name}.fish

# Subcommands
complete -c ${name} -n '__fish_use_subcommand' -a 'init' -d 'Run interactive setup wizard'
complete -c ${name} -n '__fish_use_subcommand' -a 'config' -d 'Manage configuration'

# Config subcommands
complete -c ${name} -n '__fish_seen_subcommand_from config' -a 'set' -d 'Set a config value'
complete -c ${name} -n '__fish_seen_subcommand_from config' -a 'show' -d 'Show current config'
complete -c ${name} -n '__fish_seen_subcommand_from config' -a 'reset' -d 'Reset config to defaults'
complete -c ${name} -n '__fish_seen_subcommand_from config' -a 'path' -d 'Print config directory path'

# Global options
complete -c ${name} -s m -l model -d 'Model in provider/model-id format' -x -a '${SUPPORTED_PROVIDERS.map((p) => `${p}/`).join(" ")}'
complete -c ${name} -s s -l system -d 'System prompt' -x
complete -c ${name} -s r -l role -d 'Role name from roles directory' -x
complete -c ${name} -l roles -d 'List available roles'
complete -c ${name} -s f -l file -d 'Include file contents in prompt (repeatable)' -r -F
complete -c ${name} -s i -l image -d 'Include image file (repeatable)' -r -F
complete -c ${name} -s j -l json -d 'Output full JSON response object'
complete -c ${name} -l no-stream -d 'Wait for full response, then print'
complete -c ${name} -l no-cache -d 'Disable response caching'
complete -c ${name} -s t -l temperature -d 'Sampling temperature (${APP.temperature.min}-${APP.temperature.max})' -x
complete -c ${name} -l max-output-tokens -d 'Maximum tokens to generate' -x
complete -c ${name} -s c -l config -d 'Path to config directory' -x -a '(__fish_complete_directories)'
complete -c ${name} -l cost -d 'Show token usage and cost after response'
complete -c ${name} -l markdown -d 'Render response as formatted markdown'
complete -c ${name} -l chat -d 'Start interactive chat mode'
complete -c ${name} -s C -l session -d 'Session name for conversation continuity' -x
complete -c ${name} -l providers -d 'List supported providers'
complete -c ${name} -l completions -d 'Generate shell completions' -x -a '${shells}'
complete -c ${name} -l tools -d 'Path to tools configuration file (JSON)' -r -F
complete -c ${name} -l mcp -d 'Path to MCP server configuration file (JSON)' -r -F
complete -c ${name} -l no-update-check -d 'Disable update notifications'
complete -c ${name} -s V -l version -d 'Print version'
complete -c ${name} -s h -l help -d 'Print help'

# ai alias completions
complete -c ai -n '__fish_use_subcommand' -a 'init' -d 'Run interactive setup wizard'
complete -c ai -n '__fish_use_subcommand' -a 'config' -d 'Manage configuration'
complete -c ai -n '__fish_seen_subcommand_from config' -a 'set' -d 'Set a config value'
complete -c ai -n '__fish_seen_subcommand_from config' -a 'show' -d 'Show current config'
complete -c ai -n '__fish_seen_subcommand_from config' -a 'reset' -d 'Reset config to defaults'
complete -c ai -n '__fish_seen_subcommand_from config' -a 'path' -d 'Print config directory path'
complete -c ai -s m -l model -d 'Model in provider/model-id format' -x -a '${SUPPORTED_PROVIDERS.map((p) => `${p}/`).join(" ")}'
complete -c ai -s s -l system -d 'System prompt' -x
complete -c ai -s r -l role -d 'Role name from roles directory' -x
complete -c ai -l roles -d 'List available roles'
complete -c ai -s f -l file -d 'Include file contents in prompt (repeatable)' -r -F
complete -c ai -s i -l image -d 'Include image file (repeatable)' -r -F
complete -c ai -s j -l json -d 'Output full JSON response object'
complete -c ai -l no-stream -d 'Wait for full response, then print'
complete -c ai -s t -l temperature -d 'Sampling temperature (${APP.temperature.min}-${APP.temperature.max})' -x
complete -c ai -l max-output-tokens -d 'Maximum tokens to generate' -x
complete -c ai -s c -l config -d 'Path to config directory' -x -a '(__fish_complete_directories)'
complete -c ai -l cost -d 'Show token usage and cost after response'
complete -c ai -l markdown -d 'Render response as formatted markdown'
complete -c ai -l chat -d 'Start interactive chat mode'
complete -c ai -s C -l session -d 'Session name for conversation continuity' -x
complete -c ai -l providers -d 'List supported providers'
complete -c ai -l completions -d 'Generate shell completions' -x -a '${shells}'
complete -c ai -l tools -d 'Path to tools configuration file (JSON)' -r -F
complete -c ai -l mcp -d 'Path to MCP server configuration file (JSON)' -r -F
complete -c ai -s V -l version -d 'Print version'
complete -c ai -s h -l help -d 'Print help'`;
}
