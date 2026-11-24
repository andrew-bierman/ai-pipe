import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  matchesKey,
  ProcessTerminal,
  Text,
  TuiMainScreen,
} from "@earendil-works/pi-tui";
import remend from "remend";
import { renderMarkdown } from "./markdown.ts";

const style = (code: number, reset: number) => (text: string) =>
  Bun.env.NO_COLOR === undefined ? `\x1b[${code}m${text}\x1b[${reset}m` : text;
const cyan = style(36, 39);
const bold = style(1, 22);
const dim = style(2, 22);

class ResponseText extends Text {
  private source = "";
  private complete = false;
  private width?: number;

  constructor(private markdown: boolean) {
    super("", 0, 0);
  }

  update(text: string, complete: boolean) {
    this.source = text;
    this.complete = complete;
    this.width = undefined;
  }

  override render(width: number) {
    if (this.width !== width) {
      this.width = width;
      const source =
        this.markdown && !this.complete ? remend(this.source) : this.source;
      this.setText(this.markdown ? renderMarkdown(source, width) : source);
    }
    return super.render(width);
  }
}

const CHAT_COMMANDS = [
  { name: "help", description: "Show chat commands" },
  { name: "clear", description: "Reset conversation context" },
  { name: "model", description: "Show or switch the model" },
  { name: "settings", description: "Show active request settings" },
  { name: "retry", description: "Regenerate the last answer" },
  { name: "bye", description: "Exit chat" },
];

export function createChatTui(
  model: string,
  markdown: boolean,
  interrupt: () => void,
) {
  const tui = new TuiMainScreen(new ProcessTerminal());
  const transcript = new Container();
  const status = new Text();
  const modelLabel = new Text();
  const editor = new Editor(
    tui,
    {
      borderColor: dim,
      selectList: {
        selectedPrefix: cyan,
        selectedText: bold,
        description: dim,
        scrollInfo: dim,
        noMatch: dim,
      },
    },
    { paddingX: 1 },
  );
  editor.setAutocompleteProvider(
    new CombinedAutocompleteProvider(CHAT_COMMANDS, process.cwd(), null),
  );

  tui.addChild(new Text(bold("ai-pipe chat")));
  tui.addChild(transcript);
  tui.addChild(status);
  tui.addChild(modelLabel);
  tui.addChild(editor);
  tui.setFocus(editor);

  let pending: ((text: string | undefined) => void) | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    pending?.(undefined);

    tui.stop();
  };
  tui.addInputListener((data) => {
    if (
      matchesKey(data, "ctrl+c") ||
      (matchesKey(data, "escape") && editor.disableSubmit)
    ) {
      interrupt();
      return { consume: true };
    }
    if (
      matchesKey(data, "ctrl+d") &&
      editor.getText() === "" &&
      !editor.disableSubmit
    ) {
      close();
      return { consume: true };
    }
  });
  editor.onSubmit = (text) => {
    if (!text) return;
    editor.disableSubmit = true;
    const submit = pending;
    pending = undefined;
    submit?.(text);
  };
  const setModel = (id: string) => {
    modelLabel.setText(dim(`${Bun.stripANSI(id)}  ·  /help`));
    tui.requestRender();
  };
  const notice = (text: string) => {
    transcript.addChild(new Text(dim(Bun.stripANSI(text)), 0, 0));
    tui.requestRender();
  };

  setModel(model);
  tui.start();

  return {
    read(prompt = "") {
      status.setText(dim(prompt));
      editor.disableSubmit = false;
      tui.requestRender();
      if (closed) return Promise.resolve(undefined);
      return new Promise<string | undefined>((resolve) => {
        pending = resolve;
      });
    },
    setModel,
    remember(text: string) {
      editor.addToHistory(text);
    },
    notice,
    response(prompt: string) {
      transcript.addChild(new Text(cyan(`› ${Bun.stripANSI(prompt)}`), 0, 1));
      const answer = new ResponseText(markdown);
      transcript.addChild(answer);
      status.setText(dim("Generating…  Esc or Ctrl+C to cancel"));
      tui.requestRender();
      return (text: string, complete = false) => {
        if (closed) return;
        answer.update(Bun.stripANSI(text), complete);
        if (complete) status.setText("");
        tui.requestRender();
      };
    },
    close,
  };
}
