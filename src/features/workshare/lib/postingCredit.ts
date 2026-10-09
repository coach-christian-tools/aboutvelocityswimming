import { collection, getDocs, query, where, writeBatch, doc } from "@/lib/data"
import { db } from "./backend"
import type { Posting } from "../types"

// Preserve legacy completed registrations before an administrator edits a shift.
export async function preservePostingCredit(posting: Posting) {
  const snapshot = await getDocs(query(collection(db, "registrations"),
    where("postingId", "==", posting.id)))
  const completed = snapshot.docs.filter(entry => entry.data().status === "Complete" && !entry.data().shiftSnapshot)
  for (let offset = 0; offset < completed.length; offset += 450) {
    const batch = writeBatch(db)
    for (const entry of completed.slice(offset, offset + 450)) {
      batch.update(doc(db, "registrations", entry.id), { shiftSnapshot: posting })
    }
    await batch.commit()
  }
}
