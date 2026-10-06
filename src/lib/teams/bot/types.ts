/**
 * Bot Framework activity contracts — the subset the OptSolv Time Teams app
 * actually reads. Teams sends far more; everything else is ignored.
 */

export interface ChannelAccount {
  /** Bot-scoped user id ("29:…") or the bot itself ("28:<appId>"). */
  id: string;
  name?: string;
  /** Entra object id — only present for people, never for the bot. */
  aadObjectId?: string;
}

export type ConversationType = "personal" | "groupChat" | "channel";

export interface ConversationAccount {
  id: string;
  conversationType?: ConversationType;
  tenantId?: string;
  isGroup?: boolean;
  name?: string;
}

export interface CardAttachment {
  contentType: string;
  content: unknown;
}

export interface BotActivity {
  type: string;
  id?: string;
  name?: string;
  timestamp?: string;
  serviceUrl: string;
  channelId: string;
  from: ChannelAccount;
  recipient: ChannelAccount;
  conversation: ConversationAccount;
  text?: string;
  locale?: string;
  replyToId?: string;
  value?: unknown;
  attachments?: CardAttachment[];
  membersAdded?: ChannelAccount[];
  /** installationUpdate: "add" | "remove" (and the "-upgrade" variants). */
  action?: string;
  channelData?: {
    tenant?: { id?: string };
    team?: { id?: string; name?: string };
    channel?: { id?: string; name?: string };
  };
}

/** Activity the bot sends through the Bot Connector. */
export interface OutgoingActivity {
  type: "message" | "typing";
  text?: string;
  textFormat?: "markdown" | "plain" | "xml";
  summary?: string;
  attachments?: CardAttachment[];
  replyToId?: string;
}

/** Synchronous answer to an `invoke` activity (cards, dialogs). */
export interface InvokeResponse {
  status: number;
  body?: unknown;
}

/** Teams member as returned by `GET /v3/conversations/{id}/members/{id}`. */
export interface TeamsMember {
  id: string;
  name?: string;
  aadObjectId?: string;
  email?: string;
  userPrincipalName?: string;
  tenantId?: string;
}
