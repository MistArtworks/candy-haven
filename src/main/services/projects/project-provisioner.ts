import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { PROJECT_SCAFFOLD_FOLDERS } from '@shared/domain/projects.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import { createDirectory, ensureDirectory, pathExists } from '@main/services/stacks/filesystem'

const logger = getLogger('projects:provisioner')

/**
 * Builds a new project directory on disk.
 *
 * Named `project-provisioner` rather than `provisioner` because
 * services/archive/provisioner.ts already owns that word for the mongod
 * runtime, and two files called the same thing doing entirely different jobs is
 * a trap for whoever reads this next.
 *
 * The shape it creates is the decision recorded in the plan: **the project
 * folder is the Ableton project folder**. The template set lands at its root,
 * beside the `Samples/` and `Backup/` directories Live will create on first
 * save, and our own folders sit alongside them. Nothing wraps anything.
 *
 * The alternative — an outer folder of ours containing Live's — was rejected
 * because it costs a level of nesting on the path the operator actually opens,
 * and because the scanner's whole definition of a project is "a folder that
 * directly contains a `.als`". Keeping that true means this feature needed no
 * scanner change at all.
 */

export interface ProvisionRequest {
  /** Directory that will hold the project folder. Must already exist. */
  parentPath: string
  /** Project name, already validated as a legal folder name. */
  name: string
  /** Absolute path of the operator's template `.als`. */
  templatePath: string
}

export interface ProvisionResult {
  /** Absolute path of the created project folder. */
  path: string
  /** Absolute path of the copied set inside it. */
  setPath: string
}

/**
 * Creates the directory, copies the template and makes the scaffold folders.
 *
 * Ordered so the expensive and failure-prone step comes first: if the template
 * cannot be copied, only an empty directory has been made, and it is removed
 * again before the refusal is raised. Creating six sub-folders and *then*
 * discovering the template is unreadable would leave a convincing-looking
 * project with no set in it — the one outcome worse than a plain failure.
 */
export async function provisionProject(request: ProvisionRequest): Promise<ProvisionResult> {
  const { parentPath, name, templatePath } = request

  if (!(await pathExists(templatePath))) {
    throw new AppError('The project template could not be found.', {
      code: ErrorCode.NotFound,
      hint: `Expected a set at ${templatePath}. Choose another in the INDEXING panel.`,
      recoverable: false
    })
  }

  /*
   * Ableton's own convention is `<Name> Project`, and it is followed here.
   *
   * Not cosmetic: `cleanProjectName` in the scanner strips exactly this suffix
   * to derive a display name, so a folder created without it would show up in
   * the register spelled differently from one Live made. The register should
   * not be able to tell which projects the app created.
   */
  const folderName = `${name} Project`
  const path = join(parentPath, folderName)

  // Throws if the directory already exists, which is the correct answer to two
  // projects of the same name on one shelf.
  await createDirectory(path)

  const setPath = join(path, `${name}.als`)

  try {
    // `copyFile` with no flags overwrites, but nothing can be there — the
    // directory was created empty a line ago and no other writer knows of it.
    await copyFile(templatePath, setPath)
  } catch (error) {
    // Roll the empty directory back so a failed create leaves no trace. It is
    // provably empty, so this cannot destroy anything the operator made.
    await rm(path, { recursive: true, force: true }).catch(() => undefined)

    const message = error instanceof Error ? error.message : String(error)
    throw new AppError(`Could not copy the template into ${folderName}.`, {
      code: ErrorCode.Unknown,
      hint: message,
      recoverable: true
    })
  }

  for (const folder of PROJECT_SCAFFOLD_FOLDERS) {
    // `ensureDirectory`, not `createDirectory`: a scaffold folder that somehow
    // exists is not a reason to fail a project that is otherwise made.
    await ensureDirectory(join(path, folder))
  }

  logger.info(`Provisioned project ${path}`)
  return { path, setPath }
}
