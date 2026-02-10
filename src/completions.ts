import { APP, type Shell, ShellSchema } from "./constants.ts";
import { SUPPORTED_PROVIDERS } from "./provider.ts";

const providers = SUPPORTED_PROVIDERS.join(" ");
const shells = APP.supportedShells.join(" ");
const name = APP.name;
const funcName = APP.name.replace(/-/g, "_");

export function generateCompletions(shell: string): string {
  const result = ShellSchema.safeParse(shell);
  if (!result.success) {
    console.error(`Error: Unknown shell "${shell}". Supported: ${shells}`);
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
  local cur prev opts providers
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  opts="--model --system --role --roles --file --json --no-stream --temperature --max-output-tokens --config --providers --completions --version --help"
  providers="${providers}"

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
    -f|--file)
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
    -s|--system|-r|--role|--roles|-t|--temperature|--max-output-tokens)
      return 0
      ;;
  esac

  if [[ \${cur} == -* ]]; then
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
  fi
}
complete -F _${funcName}_completions ${name}`;
}

function zsh(): string {
  return `# ${name} zsh completions
# Add to ~/.zshrc: eval "$(${name} --completions zsh)"
_${funcName}() {
  local -a providers
  providers=(${SUPPORTED_PROVIDERS.map((p) => `'${p}/'`).join(" ")})

  _arguments -s \\
    '(-m --model)'{-m,--model}'[Model in provider/model-id format]:model:->models' \\
    '(-s --system)'{-s,--system}'[System prompt]:prompt:' \\
    '(-r --role)'{-r,--role}'[Role name from roles directory]:role:' \\
    '(-R --roles)'{-R,--roles}'[List available roles]' \\
    '*'{-f,--file}'[Include file contents]:file:_files' \\
    '(-j --json)'{-j,--json}'[Output full JSON response object]' \\
    '--no-stream[Wait for full response, then print]' \\
    '(-t --temperature)'{-t,--temperature}'[Sampling temperature (${APP.temperature.min}-${APP.temperature.max})]:temp:' \\
    '--max-output-tokens[Maximum tokens to generate]:tokens:' \\
    '(-c --config)'{-c,--config}'[Path to config directory]:dir:_directories' \\
    '--providers[List supported providers]' \\
    '--completions[Generate shell completions]:shell:(${shells})' \\
    '(-V --version)'{-V,--version}'[Print version]' \\
    '(-h --help)'{-h,--help}'[Print help]' \\
    '*:prompt:' \\
    && return 0

  case "$state" in
    models)
      _describe -t providers 'provider' providers -S ''
      ;;
  esac
}
compdef _${funcName} ${name}`;
}

function fish(): string {
  return `# ${name} fish completions
# Add to ~/.config/fish/completions/${name}.fish
complete -c ${name} -s m -l model -d 'Model in provider/model-id format' -x -a '${SUPPORTED_PROVIDERS.map((p) => `${p}/`).join(" ")}'
complete -c ${name} -s s -l system -d 'System prompt' -x
complete -c ${name} -s r -l role -d 'Role name from roles directory' -x
complete -c ${name} -s R -l roles -d 'List available roles'
complete -c ${name} -s f -l file -d 'Include file contents in prompt (repeatable)' -r -F
complete -c ${name} -s j -l json -d 'Output full JSON response object'
complete -c ${name} -l no-stream -d 'Wait for full response, then print'
complete -c ${name} -s t -l temperature -d 'Sampling temperature (${APP.temperature.min}-${APP.temperature.max})' -x
complete -c ${name} -l max-output-tokens -d 'Maximum tokens to generate' -x
complete -c ${name} -s c -l config -d 'Path to config directory' -x -a '(__fish_complete_directories)'
complete -c ${name} -l providers -d 'List supported providers'
complete -c ${name} -l completions -d 'Generate shell completions' -x -a '${shells}'
complete -c ${name} -s V -l version -d 'Print version'
complete -c ${name} -s h -l help -d 'Print help'`;
}
