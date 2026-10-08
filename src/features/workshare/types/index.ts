import { Timestamp } from "firebase/firestore"

export type ChildGroup = 
  | "No Assignment"
  | "Splash"
  | "Pre-Team"
  | "Prep"
  | "Age Groupers"
  | "Juniors"
  | "Seniors"
  | "Masters"
  | "Rec Team"
  | "Coaches"
  | "Board Members"

export interface Child {
  id?: string
  name: string
  group: ChildGroup
}

export interface Family {
  id: string
  accountName?: string
  authorizedEmails: string[]
  category: "Recreation" | "Development" | "Competitive" | "Masters"
  requirements: {
    generalPoolHours: number
    eventSpecificHours: number
  }
  children?: Child[]
  members?: {
    fullName: string
    category: "Recreation" | "Development" | "Competitive" | "Masters"
  }[]
}

export interface Posting {
  id: string
  type: "General" | "Event-Specific"
  title: string
  date: Timestamp
  startTime?: Timestamp | null
  endTime?: Timestamp | null
  description?: string | null
  positions: {
    min: number
    desired: number
    max: number
  }
  pointOfContact?: string
  archived?: boolean
  status: "Open" | "Filled" | "Completed"
}

export interface Registration {
  id: string
  shiftSnapshot?: Posting
  postingId: string
  familyId: string
  assignee: {
    name: string
    isGuest: boolean
    relation?: string
  }
  status: "Pending" | "Complete" | "Incomplete"
}

export interface ManualHour {
  id: string
  familyId: string
  date: Timestamp
  startTime?: string | null
  endTime?: string | null
  hours: number
  type: "General" | "Event-Specific"
  description?: string | null
}

export interface WorkDescription {
  id: string
  text: string
}
