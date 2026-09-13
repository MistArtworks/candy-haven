# Shortcuts

Every chord the console binds, by where it applies. A chord marked _while
typing_ still works from inside a text field — the rest deliberately do not, so
naming a project cannot trigger an action.

> The console also has a live cheatsheet, generated from the same registry these
> are drawn from. This chapter is the written copy; the cheatsheet is always
> current for the page you are on.

## Global

Available from any department.

| Chord                   | Does                                               | While typing |
| ----------------------- | -------------------------------------------------- | ------------ |
| `Ctrl`+`1` … `Ctrl`+`9` | Walk the department rail, in the order it is drawn | Yes          |
| `Ctrl`+`0`              | The tenth department — CATECHISM                   | Yes          |
| `Ctrl`+`,`              | Open REGULATION                                    | Yes          |
| `Ctrl`+`Shift`+`O`      | Open OBSERVATORY                                   | Yes          |
| `Ctrl`+`Shift`+`K`      | Open CATECHISM                                     | Yes          |
| `F1`                    | Quick guide for the department you are on          | Yes          |
| `Ctrl`+`/`              | The live cheatsheet — every chord currently bound  | Yes          |

`Ctrl`+`/` is worth knowing above all the rest. It lists exactly what is bound
_right now_, generated from the same registry the console actually dispatches
from — so it cannot drift from the truth the way a written page can.

The numbers come from the registry rather than being hard-coded, so a department
added or removed renumbers the rest with it. Reserved departments are bound too
— they are on the rail, and a shortcut that silently skipped one would make the
numbering stop matching what is on screen.

## ARCHIVE

| Chord             | Does                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `Ctrl+F`          | Search the register. Selects what is there, so the next keystroke replaces it |
| `Ctrl+A`          | Mark everything in scope, or clear it if all are already marked               |
| `Ctrl+E`          | Cycle list, icons, board                                                      |
| `Ctrl+B`          | Favourites only                                                               |
| `Ctrl+R`          | Scan for changes                                                              |
| `Ctrl+Shift+R`    | Re-read every project                                                         |
| `Ctrl+N`          | New folder on this shelf                                                      |
| `Ctrl+Shift+N`    | New project on this shelf                                                     |
| `Alt+↑`           | Up one shelf                                                                  |
| `Alt+1` … `Alt+5` | Switch lens — STACKS, INTAKE, VOLUMES, ALL, BIN                               |
| `Escape`          | Close what is open — the menu, then marks, then the cursor                    |

`Ctrl+A` deliberately does **not** fire while a text field has focus, so
selecting the text you have typed into the search box still works.

`Escape` unwinds one layer at a time, in the order things were put on top of
each other. Marks come before the cursor: a stray Escape that dropped a
twelve-project selection while merely deselecting a tile would be the expensive
mistake of the two.

`Ctrl+F` is the one exception to the no-typing rule: it has to work _from_ the
search field, or you cannot get back to it after tabbing away.

`Ctrl+Shift+N` needs a shelf. At the root of the tree there is nowhere to put a
project, so it is disabled rather than creating one somewhere arbitrary.

## DISPATCH

| Chord    | Does             |
| -------- | ---------------- |
| `Ctrl+N` | File something   |
| `Escape` | Close the thread |

## THE CONCORD

| Chord              | Does              |
| ------------------ | ----------------- |
| `Ctrl+Enter`       | Put the question  |
| `Ctrl+Shift+Enter` | Close the chamber |
| `Ctrl+Shift+X`     | Clear the ballot  |

## THE MUSTER

| Chord              | Does           |
| ------------------ | -------------- |
| `Ctrl+Enter`       | Put the call   |
| `Ctrl+Shift+Enter` | Close the call |
| `Ctrl+Shift+X`     | Clear the roll |

## RESONANCE SELECTION

| Chord          | Does            |
| -------------- | --------------- |
| `Space`        | Draw a petition |
| `Ctrl+Shift+X` | Clear the ring  |

## INTERVAL and CONVENING

| Chord          | Does                                         |
| -------------- | -------------------------------------------- |
| `Space`        | Start the clock, or hold it if it is running |
| `Ctrl+Enter`   | Restart from the top                         |
| `Ctrl+Shift+X` | Clear the clock                              |
| `Ctrl+↑`       | Add a minute                                 |
| `Ctrl+↓`       | Take a minute off                            |

## CALENDAR

| Chord                   | Does                     |
| ----------------------- | ------------------------ |
| `Alt`+`1` … `Alt`+`4`   | MONTH, WEEK, DAY, AGENDA |
| `Ctrl`+`←` / `Ctrl`+`→` | Previous / next period   |
| `Ctrl`+`T`              | Back to today            |
| `Ctrl`+`N`              | File an entry            |
| `Escape`                | Close the dialog         |

`Ctrl`+`N` opens on the **anchored** date — the day the register is showing,
not today. In MONTH that is the first of the month.

## AUDITORIUM

| Chord                   | Does                                 |
| ----------------------- | ------------------------------------ |
| `Space`                 | Play, or hold                        |
| `Ctrl`+`O`              | Admit a file                         |
| `Ctrl`+`←` / `Ctrl`+`→` | Back / forward five seconds          |
| `Ctrl`+`Home`           | Back to the top                      |
| `Alt`+`1` … `Alt`+`4`   | WAVEFORM, SPECTRUM, SPECTRAL, STATIC |

Seeking is on `Ctrl`+arrows rather than bare arrows: a bare arrow is how a
keyboard user moves focus, and taking it would make the department unnavigable.

## Quick guides

| Chord    | Does                |
| -------- | ------------------- |
| `←` `→`  | Page through slides |
| `Escape` | Close the guide     |
