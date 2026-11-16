# Label spot check

Ground truth is checked, not trusted. 30 pairs were drawn at random (seed 20261117, `eval/label_check_sample.py`) from the
1,925 pairs produced by the first version of the extraction. For each pair the titles, the bodies (template boilerplate removed)
and the comment containing the reference were read. The reading was done by the AI assistant that built this project, not by a
maintainer of the repository. Notes below are in the reviewer's own words; no issue text is reproduced.

**Result: 28 of 30 correct (93%); 2 doubtful.**

Verdicts: *correct* = the two issues describe the same bug or request; *doubtful* = the maintainer hedged or the overlap is only partial.

| # | duplicate | original | verdict | note |
|---|---|---|---|---|
| 1 | #9480 | #4217 | correct | both about running Terminal as a different user identity |
| 2 | #3125 | #878 | correct | both: wt ignores the caller's working directory |
| 3 | #1010 | #521 | correct | both: AltGr key combinations (e.g. @) cannot be typed |
| 4 | #3829 | #3801 | correct | both: typing exit in a second tab closes the whole window |
| 5 | #3596 | #2397 | correct | both: arrow keys arrive with wrong key codes through ConPTY |
| 6 | #3688 | #531 | correct | both ask for a fullscreen mode; the comment names two issues (#531 and #3411), extraction v1 kept only the first |
| 7 | #4787 | #4109 | doubtful | maintainer writes 'without more details, this sounds like'; report body is empty; link not convincing |
| 8 | #4435 | #603 | correct | both ask for plain background opacity without acrylic |
| 9 | #3692 | #3446 | correct | both: window content not drawn after restore/maximize |
| 10 | #4792 | #4472 | correct | both: wt subcommands should act on the existing window |
| 11 | #5841 | #4472 | correct | both: run wt commands in an existing window/session |
| 12 | #2071 | #1032 | correct | both: elevated / other-user tabs (megathread) |
| 13 | #577 | #564 | correct | both: drag the window by the tab bar area |
| 14 | #9850 | #766 | correct | both: restore previously open tabs |
| 15 | #8272 | #2991 | correct | both: dropdown shows default instead of user key bindings |
| 16 | #4880 | #1571 | correct | folder grouping of profiles is tracked in the dropdown-customisation issue; low text overlap but same request |
| 17 | #4369 | #610 | correct | font rendering problem, folded into the font rendering thread |
| 18 | #4317 | #2865 | correct | both: Ctrl+Space not delivered to the application |
| 19 | #5962 | #1386 | correct | both: installation without the Store |
| 20 | #7850 | #3158 | correct | duplicate-pane does not keep the directory = new tab in same directory request |
| 21 | #2914 | #1564 | correct | both ask for a settings UI |
| 22 | #10177 | #9320 | correct | both: settings dropdown floats outside the window when scrolling |
| 23 | #6171 | #878 | correct | both: start in current working directory; the comment lists the original followed by nine sibling duplicates, v1 kept only the first (which is the right original) |
| 24 | #8144 | #7360 | correct | maintainer concludes same by-design behaviour for background colour on new lines |
| 25 | #5259 | #3609 | correct | both: clicking the active tab does not focus the text area |
| 26 | #5880 | #1280 | doubtful | maintainer says 'tracking related work in'; one asks for a profile/password manager, the other for serial/ssh connection types; overlap is partial |
| 27 | #3352 | #2634 | correct | both: broadcast input to all tabs/panes |
| 28 | #3002 | #1205 | correct | symptom report matched by maintainer to the underlying focus-tracking work item; low text overlap |
| 29 | #4441 | #715 | correct | both: keyboard text selection |
| 30 | #7378 | #376 | correct | both: mouse input not passed to applications |

## What changed because of the check

1. Pairs 6 and 23 showed that a comment can list several issues after the keyword (`/dup #A, #B and #C`). Extraction v1 read only the first number,
   so its "exactly one original" rule was not really enforced. The extraction now reads the whole list and drops such pairs as ambiguous
   (37 more pairs dropped). Both sampled pairs were correct duplicates, so they count as correct above, but they are no longer in the pair set.
2. The two doubtful pairs (7 and 26) are excluded through `manifest/excluded_pairs.json`.
3. Pair set after the check: 1,886 pairs (1,320 tuning, 566 held-out). See `manifest/pairs.json` for the drop counts.

## Limits

- 30 pairs is a small sample: with 28/30 observed, the true error rate of the pair set could plausibly be anywhere from about 1% to 20%.
- Several correct pairs (16, 20, 28) share a root cause but almost no wording. A text search cannot be expected to find those; they cap the achievable score.
- Many originals are "megathreads" that collect dozens of duplicates. This makes the pair set easier than a set of one-off duplicates.
- Only precision was checked. Duplicates that maintainers closed without a `duplicate of #N` style comment (503 candidates) are missing from the set.
