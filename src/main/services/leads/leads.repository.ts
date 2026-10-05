import type { Collection } from 'mongodb'
import type { z } from 'zod'
import { LeadSchema, OpportunitySchema, type Lead, type Opportunity } from '@shared/domain/leads'
import { getLogger } from '@main/core/logger'
import { Collections } from '@main/services/archive/schema'
import type { ArchiveService } from '../archive/archive.service'

const logger = getLogger('leads:repository')

/** One document per record, keyed by the id the service mints. */
type Document<T> = T & { _id: string }

/**
 * Persistence for leads and opportunities, one collection each.
 *
 * Writes propagate their errors, as CALENDAR's do: a follow-up Candy was told
 * was saved, and wasn't, surfaces at the worst moment. Reads stay tolerant,
 * so one unreadable record doesn't take the department down with it.
 */
export class LeadsRepository {
  constructor(private readonly archive: ArchiveService) {}

  get attached(): boolean {
    return this.archive.isConnected()
  }

  private leads(): Collection<Document<Lead>> {
    return this.archive.getDb().collection<Document<Lead>>(Collections.Leads)
  }

  private opportunities(): Collection<Document<Opportunity>> {
    return this.archive.getDb().collection<Document<Opportunity>>(Collections.Opportunities)
  }

  listLeads(): Promise<Lead[]> {
    return this.read(this.leads(), LeadSchema, 'lead')
  }

  listOpportunities(): Promise<Opportunity[]> {
    return this.read(this.opportunities(), OpportunitySchema, 'opportunity')
  }

  async putLead(lead: Lead): Promise<void> {
    await this.leads().updateOne(
      { _id: lead.id },
      { $set: { ...lead, _id: lead.id } },
      { upsert: true }
    )
  }

  async putOpportunity(opportunity: Opportunity): Promise<void> {
    await this.opportunities().updateOne(
      { _id: opportunity.id },
      { $set: { ...opportunity, _id: opportunity.id } },
      { upsert: true }
    )
  }

  async removeLead(id: string): Promise<void> {
    await this.leads().deleteOne({ _id: id })
  }

  async removeOpportunity(id: string): Promise<void> {
    await this.opportunities().deleteOne({ _id: id })
  }

  /**
   * Parsed rather than cast: a record written by an earlier build is missing
   * whatever has been added since, and the schema's defaults fill it in. One
   * that can't be repaired is skipped and logged.
   */
  private async read<T extends { id: string }>(
    collection: Collection<Document<T>>,
    schema: z.ZodType<T>,
    what: string
  ): Promise<T[]> {
    if (!this.attached) return []
    try {
      const documents = await collection.find({}).sort({ createdAt: 1 }).toArray()
      const records: T[] = []
      for (const document of documents) {
        const parsed = schema.safeParse(document)
        if (parsed.success) {
          records.push(parsed.data)
          continue
        }
        logger.warn(
          `Skipping unreadable ${what} ${String(document._id)}`,
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
      }
      return records
    } catch (cause) {
      logger.warn(`Could not read the ${what} records`, cause)
      return []
    }
  }
}
