import type { AppState } from './types';

export interface PinTabMessage {
  action: 'PIN_TAB';
  payload: { tabId: number };
}

export interface UnpinTabMessage {
  action: 'UNPIN_TAB';
  payload: { id: string };
}

export interface RenameTabMessage {
  action: 'RENAME_TAB';
  payload: { id: string; customName: string };
}

export interface GoHomeMessage {
  action: 'GO_HOME';
  payload: { id: string };
}

export interface ReopenTabMessage {
  action: 'REOPEN_TAB';
  payload: { id: string };
}

export interface CreateGroupMessage {
  action: 'CREATE_GROUP';
  payload: { name: string; color: string };
}

export interface UpdateGroupMessage {
  action: 'UPDATE_GROUP';
  payload: { id: string; name?: string; color?: string };
}

export interface DeleteGroupMessage {
  action: 'DELETE_GROUP';
  payload: { id: string };
}

export interface MoveToGroupMessage {
  action: 'MOVE_TO_GROUP';
  payload: { tabId: string; groupId: string | null };
}

export interface GetStateMessage {
  action: 'GET_STATE';
  payload: Record<string, never>;
}

export interface StateUpdatedMessage {
  action: 'STATE_UPDATED';
  payload: AppState;
}

export type Message =
  | PinTabMessage
  | UnpinTabMessage
  | RenameTabMessage
  | GoHomeMessage
  | ReopenTabMessage
  | CreateGroupMessage
  | UpdateGroupMessage
  | DeleteGroupMessage
  | MoveToGroupMessage
  | GetStateMessage
  | StateUpdatedMessage;
