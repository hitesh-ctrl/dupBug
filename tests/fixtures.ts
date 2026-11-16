// Synthetic issues written for the tests (not real issue text).
export interface FixtureIssue {
  number: number;
  title: string;
  body: string;
  created_at: string;
  url: string;
}

const mk = (number: number, created_at: string, title: string, body: string): FixtureIssue => ({
  number,
  title,
  body,
  created_at,
  url: `https://example.test/issues/${number}`,
});

export const FIXTURES: FixtureIssue[] = [
  mk(1, "2020-01-01T00:00:00Z", "Terminal crashes when pasting large text", "Paste a 5 MB file into the terminal and the window closes."),
  mk(2, "2020-01-02T00:00:00Z", "Add a setting for cursor colour", "It would be nice to change the cursor colour in the profile settings."),
  mk(3, "2020-01-03T00:00:00Z", "Crash on paste of large clipboard content", "The terminal crashes after pasting a very large clipboard."),
  mk(4, "2020-01-04T00:00:00Z", "Tab title does not update after ssh", "Tab title stays the same when connecting over ssh."),
  mk(5, "2020-01-05T00:00:00Z", "Pasting large text crashes the terminal", "Same crash when pasting large text from the clipboard."),
  mk(6, "2020-01-06T00:00:00Z", "Scrollbar flickers while resizing the window", "Resize the window quickly and the scrollbar flickers."),
  mk(7, "2020-01-07T00:00:00Z", "Paste of large text crashes terminal again", "Large paste, crash, window closes."),
  mk(8, "2020-01-08T00:00:00Z", "Font ligatures are not rendered", "Ligatures from Cascadia Code do not show up."),
];
