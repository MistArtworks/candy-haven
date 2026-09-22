const { MongoClient } = require('mongodb')
;(async () => {
  const c = new MongoClient('mongodb://127.0.0.1:27941', { serverSelectionTimeoutMS: 8000 })
  await c.connect(); const db = c.db('candy_haven')
  const rel = await db.collection('discography').find({}, { projection: { title: 1 } }).toArray()
  const art = await db.collection('archive_artists').find({}, { projection: { name: 1, isOperator: 1 } }).toArray()
  console.log('REAL ARCHIVE (Roaming\candy-haven)')
  console.log('  releases:', rel.map(r => r.title).join(', ') || '(none)')
  console.log('  artists :', art.map(a => a.name + (a.isOperator ? ' (operator)' : '')).join(', ') || '(none)')
  try { await c.db('admin').command({ shutdown: 1 }) } catch {}
})()
