# Commissioning

What to set up on a fresh installation, in the order that avoids doubling back.
Steps 1 and 2 are required before the ARCHIVE will draw anything at all. The
rest are optional and depend on what you intend to use.

## 1. Establish the archive

![archive-05-setup.png](archive-05-setup.png)

The filing root is the directory the archive builds in. Until it is chosen,
ARCHIVE shows a setup gate rather than an empty register — a deliberate choice,
because an empty ARCHIVE and an unconfigured one look identical and mean
completely different things. The gate sits inert at the foot of the ARCHIVE
page rather than blocking it, so you can look around before filling it in.

1. Open [ARCHIVE](/archive) directly. REGULATION only reports the filing root
   once it exists — it has no way to set it.
2. Choose an **archive location**. It does not need to hold your projects
   already: everything the archive creates lives inside one `Candy Haven`
   directory here, so nothing of yours is intermixed with ours. Your music
   folder is a reasonable choice.
3. Choose a **project template** — an Ableton set copied into every project you
   create. Both a location and a template are required before the gate clears.
4. Optionally add any directories your projects are already in. Nothing is
   moved yet; they are read only, and everything found is ready to file once
   the register opens.
5. Press **Establish**. The gate reads back what it will create first, under
   **What gets created**.

```
D:\Music                    <- archive location
└── Candy Haven             <- everything the app made, kept in one place
    └── Projects
        ├── Electronic      <- a category
        │   ├── Halftime    <- a genre
        │   │   └── Ossuary <- a project
        │   └── Drum and Bass
        └── Collaborations
```

> Chosen once, at the gate. REGULATION reports the filing root but cannot
> change it — repointing it would not move what is already filed, so there is
> no button there that would only pretend to.

## 2. Confirm the archive is running

Open [NEXUS](/). The line beneath the wordmark reads `All systems resonant.`
and **ARCHIVE** reads `ONLINE` when the database is up. If it does not,
**Descend** to the diagnostic grid, which names the fault in the **01 ARCHIVE**
panel's _Last event_ field.

The most common first-run case is the MongoDB runtime still downloading. That is
expected and self-resolving: the installer fetches it, and if that was blocked
the application provisions it itself on first launch, with resume support.

## 3. Bring existing work into the register

![archive-03-intake.png](archive-03-intake.png)

If you have projects on disk that are not under the filing root, INTAKE is how
they get in.

1. Add the directory your projects are in, if the gate did not already have
   it: REGULATION → ARCHIVE → **Other locations** → **Add**.
2. Open ARCHIVE and select the **INTAKE** lens. **ON DISK**, on the left, lists
   what it found that the register does not know.
3. On the right, **INTO THE ARCHIVE**, open the shelf the work belongs on.
4. Tick the projects to take (Ctrl-click to add, Shift-click for a run), and
   press **File N into** the shelf. Or drag them onto it.

Whether intake moves or copies is set in REGULATION under ARCHIVE. **Move** is
the default, and it is the right default — two copies of a project is how you
end up spending an evening mixing the wrong one.

## 4. Attach the broadcast kit

Only needed if you intend to run overlays.

| Overlay                 | Needs                                                 |
| ----------------------- | ----------------------------------------------------- |
| NOW TRANSMITTING        | A Spotify client id, set in REGULATION → INTEGRATIONS |
| THE CONCORD, THE MUSTER | A Twitch channel, set in REGULATION → INTEGRATIONS    |
| RESONANCE SELECTION     | Nothing, unless you want chat-filed petitions         |
| INTERVAL, CONVENING     | Nothing                                               |

Then add each one to OBS as a Browser source — see the [OBSERVATORY](/catechism)
chapter for the exact steps.

## 5. Attach the shared board

Only if you are the second operator. DISPATCH needs a shared Firebase project,
configured in REGULATION under **BOARD** by pasting the whole snippet the
Firebase console shows. There is no account to create inside Candy Haven.

## A reasonable first session

1. Set the filing root.
2. Create one category and one genre under it, so the tree has a shape.
3. File one project you are actually working on.
4. Open its dossier and set its stage honestly.
5. Open AUDITORIUM and play its latest bounce.

That exercises the filing tree, the register, the pipeline and the listening
room in about five minutes, and it will tell you quickly whether the filing root
is pointed where you meant.
