# Commissioning

What to set up on a fresh installation, in the order that avoids doubling back.
Steps 1 and 2 are required before the ARCHIVE will draw anything at all. The
rest are optional and depend on what you intend to use.

## 1. Set the filing root

![archive-05-setup.png](archive-05-setup.png)

The filing root is the directory your shelves actually live in. Until it is set,
ARCHIVE shows a setup gate rather than an empty register — a deliberate choice,
because an empty ARCHIVE and an unconfigured one look identical and mean
completely different things.

1. Open [REGULATION](/regulation) and select the **ARCHIVE** category.
2. Set **Filing root** to the directory you keep music projects in.
3. Return to [ARCHIVE](/archive). The gate is replaced by the register.

Pick the directory you _already_ use. Candy Haven files into real folders on
disk, so pointing it at your existing library means your existing work is
already where it expects.

```
D:\Music\Projects           <- filing root
├── Electronic              <- a category
│   ├── Halftime            <- a genre
│   │   └── Ossuary         <- a project
│   └── Drum and Bass
└── Collaborations
```

> Moving the filing root later is not a migration — it re-points the console at
> a different tree. Move the files yourself first, then change the setting.

## 2. Confirm the archive is running

Open [NEXUS](/) and look at the orb on the landing. Steady means the database is
up. If it is not, the diagnostic grid one scroll down names the fault in the
**01 ARCHIVE** panel's _Last event_ field.

The most common first-run case is the MongoDB runtime still downloading. That is
expected and self-resolving: the installer fetches it, and if that was blocked
the application provisions it itself on first launch, with resume support.

## 3. Bring existing work into the register

![archive-03-intake.png](archive-03-intake.png)

If you have projects on disk that are not under the filing root, INTAKE is how
they get in.

1. Open ARCHIVE and select the **INTAKE** lens.
2. Point it at a directory. It lists what it finds that the register does not know.
3. Choose a shelf and move the work onto it.

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
