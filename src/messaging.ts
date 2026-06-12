import type { SpaceIconId, TabGroupColor } from './types';

export interface WindowScopedPayload {
  windowId?: number | null;
}

export interface GetPanelStateMessage {
  action: 'GET_PANEL_STATE';
  payload: WindowScopedPayload;
}

export interface CreateTabMessage {
  action: 'CREATE_TAB';
  payload: WindowScopedPayload;
}

export interface ActivateTabMessage {
  action: 'ACTIVATE_TAB';
  payload: { tabId: number } & WindowScopedPayload;
}

export interface CloseTabMessage {
  action: 'CLOSE_TAB';
  payload: { tabId: number } & WindowScopedPayload;
}

export interface MoveTabMessage {
  action: 'MOVE_TAB';
  payload: { tabId: number; index: number } & WindowScopedPayload;
}

export interface CreateHomePinMessage {
  action: 'CREATE_HOME_PIN';
  payload: { tabId: number } & WindowScopedPayload;
}

export interface RemoveHomePinMessage {
  action: 'REMOVE_HOME_PIN';
  payload: { homePinId: string } & WindowScopedPayload;
}

export interface EditHomePinUrlMessage {
  action: 'EDIT_HOME_PIN_URL';
  payload: { homePinId: string; homeUrl: string } & WindowScopedPayload;
}

export interface RenameTabAliasMessage {
  action: 'RENAME_TAB_ALIAS';
  payload: {
    tabId?: number;
    homePinId?: string;
    alias: string;
  } & WindowScopedPayload;
}

export interface GoHomeMessage {
  action: 'GO_HOME';
  payload: { homePinId: string } & WindowScopedPayload;
}

export interface ReopenHomePinMessage {
  action: 'REOPEN_HOME_PIN';
  payload: { homePinId: string } & WindowScopedPayload;
}

export interface MoveHomePinMessage {
  action: 'MOVE_HOME_PIN';
  payload: { homePinId: string; index: number } & WindowScopedPayload;
}

export interface SwitchSpaceMessage {
  action: 'SWITCH_SPACE';
  payload: { spaceId: string } & WindowScopedPayload;
}

export interface CreateSpaceMessage {
  action: 'CREATE_SPACE';
  payload: { name: string; icon?: SpaceIconId } & WindowScopedPayload;
}

export interface RenameSpaceMessage {
  action: 'RENAME_SPACE';
  payload: { spaceId: string; name: string } & WindowScopedPayload;
}

export interface UpdateSpaceMessage {
  action: 'UPDATE_SPACE';
  payload: {
    spaceId: string;
    name?: string;
    icon?: SpaceIconId;
  } & WindowScopedPayload;
}

export interface DeleteSpaceMessage {
  action: 'DELETE_SPACE';
  payload: { spaceId: string } & WindowScopedPayload;
}

export interface CreateGroupFromTabMessage {
  action: 'CREATE_GROUP_FROM_TAB';
  payload: {
    tabId: number;
    title?: string;
    color?: TabGroupColor;
  } & WindowScopedPayload;
}

export interface MoveTabToGroupMessage {
  action: 'MOVE_TAB_TO_GROUP';
  payload: { tabId: number; groupId: number } & WindowScopedPayload;
}

export interface UngroupTabMessage {
  action: 'UNGROUP_TAB';
  payload: { tabId: number } & WindowScopedPayload;
}

export interface UpdateGroupMessage {
  action: 'UPDATE_GROUP';
  payload: {
    groupId: number;
    title?: string;
    color?: TabGroupColor;
    collapsed?: boolean;
  } & WindowScopedPayload;
}

export interface CloseGroupMessage {
  action: 'CLOSE_GROUP';
  payload: { groupId: number } & WindowScopedPayload;
}

export interface LinkRoutingPolicy {
  isHomePin: boolean;
  homeUrl: string | null;
}

export interface GetLinkRoutingPolicyMessage {
  action: 'GET_LINK_ROUTING_POLICY';
  payload: Record<string, never>;
}

export interface OpenExternalLinkFromHomePinMessage {
  action: 'OPEN_EXTERNAL_LINK_FROM_HOME_PIN';
  payload: { url: string };
}

export interface LinkRoutingPolicyUpdatedMessage {
  action: 'LINK_ROUTING_POLICY_UPDATED';
  payload: LinkRoutingPolicy;
}

export interface OpenExternalLinkFromHomePinResponse {
  opened: boolean;
}

export interface PanelStateUpdatedMessage {
  action: 'PANEL_STATE_UPDATED';
  payload: Record<string, never>;
}

export type RequestMessage =
  | GetPanelStateMessage
  | CreateTabMessage
  | ActivateTabMessage
  | CloseTabMessage
  | MoveTabMessage
  | CreateHomePinMessage
  | RemoveHomePinMessage
  | EditHomePinUrlMessage
  | RenameTabAliasMessage
  | GoHomeMessage
  | ReopenHomePinMessage
  | MoveHomePinMessage
  | SwitchSpaceMessage
  | CreateSpaceMessage
  | RenameSpaceMessage
  | UpdateSpaceMessage
  | DeleteSpaceMessage
  | CreateGroupFromTabMessage
  | MoveTabToGroupMessage
  | UngroupTabMessage
  | UpdateGroupMessage
  | CloseGroupMessage;

export type ContentRequestMessage =
  | GetLinkRoutingPolicyMessage
  | OpenExternalLinkFromHomePinMessage;

export type BroadcastMessage =
  | PanelStateUpdatedMessage
  | LinkRoutingPolicyUpdatedMessage;

export type Message = RequestMessage | ContentRequestMessage | BroadcastMessage;
