import { SUPPORTED_PROVIDERS } from "./provider.ts";

const providers = SUPPORTED_PROVIDERS.join(" ");

export function generateCompletions(shell: string): string {
  switch (shell) {
    case "bash":
      return bash();
    case "zsh":
      return zsh();
    case "fish":
      return fish();
    default:
      console.error(
        `Error: Unknown shell "${shell}". Supported: bash, zsh, fish`
      );
      process.exit(1);
  }
}

function bash(): string {
  return `# ai-cli bash completions
# Add to ~/.bashrc: eval "$(ai --completions bash)"
_ai_completions() {
  local cur prev opts providers
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  opts="--model --system --json --no-stream --temperature --max-output-tokens --config --providers --completions --version --help"
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
    -c|--config)
      COMPREPLY=( $(compgen -f -- "\${cur}") )
      return 0
      ;;
    --completions)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
    -s|--system|-t|--temperature|--max-output-tokens)
      return 0
      ;;
  esac

  if [[ \${cur} == -* ]]; then
    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
  fi
}
complete -F _ai_completions ai`;
}

function zsh(): string {
  return `# ai-cli zsh completions
# Add to ~/.zshrc: eval "$(ai --completions zsh)"
_ai() {
  local -a providers
  providers=(${SUPPORTED_PROVIDERS.map((p) => `'${p}/'`).join(" ")})

  _arguments -s \\
    '(-m --model)'{-m,--model}'[Model in provider/model-id format]:model:->models' \\
    '(-s --system)'{-s,--system}'[System prompt]:prompt:' \\
    '(-j --json)'{-j,--json}'[Output full JSON response object]' \\
    '--no-stream[Wait for full response, then print]' \\
    '(-t --temperature)'{-t,--temperature}'[Sampling temperature (0-2)]:temp:' \\
    '--max-output-tokens[Maximum tokens to generate]:tokens:' \\
    '(-c --config)'{-c,--config}'[Path to config file]:file:_files' \\
    '--providers[List supported providers]' \\
    '--completions[Generate shell completions]:shell:(bash zsh fish)' \\
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
compdef _ai ai`;
}

function fish(): string {
  return `# ai-cli fish completions
# Add to ~/.config/fish/completions/ai.fish
complete -c ai -s m -l model -d 'Model in provider/model-id format' -x -a '${SUPPORTED_PROVIDERS.map((p) => `${p}/`).join(" ")}'
complete -c ai -s s -l system -d 'System prompt' -x
complete -c ai -s j -l json -d 'Output full JSON response object'
complete -c ai -l no-stream -d 'Wait for full response, then print'
complete -c ai -s t -l temperature -d 'Sampling temperature (0-2)' -x
complete -c ai -l max-output-tokens -d 'Maximum tokens to generate' -x
complete -c ai -s c -l config -d 'Path to config file' -r -F
complete -c ai -l providers -d 'List supported providers'
complete -c ai -l completions -d 'Generate shell completions' -x -a 'bash zsh fish'
complete -c ai -s V -l version -d 'Print version'
complete -c ai -s h -l help -d 'Print help'`;
}
