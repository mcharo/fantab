import type { SectionUnitRef, SpaceIcon, TabMediaState } from './types';

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

export interface CloseTabsMessage {
  action: 'CLOSE_TABS';
  payload: { tabIds: number[] } & WindowScopedPayload;
}

/**
 * Move focus off a set of tabs about to be deferred-closed, without removing
 * them. Used by "Close all" so the soon-to-close active tab isn't left in front
 * during the restore window.
 */
export interface PreserveCloseFocusMessage {
  action: 'PRESERVE_CLOSE_FOCUS';
  payload: { tabIds: number[] } & WindowScopedPayload;
}

/**
 * Reorder a unit (folder, loose home pin, or loose live tab) so it lands
 * immediately before/after a target unit within the same section. The pinned
 * section rewrites home-pin order; the unpinned section moves live tabs in the
 * real browser strip.
 */
export interface ReorderSectionMessage {
  action: 'REORDER_SECTION';
  payload: {
    dragged: SectionUnitRef;
    target: SectionUnitRef;
    position: 'before' | 'after';
  } & WindowScopedPayload;
}

export interface SetTabMutedMessage {
  action: 'SET_TAB_MUTED';
  payload: { tabId: number; muted: boolean } & WindowScopedPayload;
}

export interface CreateHomePinMessage {
  action: 'CREATE_HOME_PIN';
  payload: { tabId: number } & WindowScopedPayload;
}

export interface CreateHomePinsMessage {
  action: 'CREATE_HOME_PINS';
  payload: { tabIds: number[] } & WindowScopedPayload;
}

export interface RemoveHomePinMessage {
  action: 'REMOVE_HOME_PIN';
  payload: { homePinId: string } & WindowScopedPayload;
}

export interface RemoveHomePinsMessage {
  action: 'REMOVE_HOME_PINS';
  payload: { homePinIds: string[] } & WindowScopedPayload;
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

export interface MoveTabToSpaceMessage {
  action: 'MOVE_TAB_TO_SPACE';
  payload: {
    spaceId: string;
    tabId?: number;
    homePinId?: string;
  } & WindowScopedPayload;
}

/**
 * Move a selection of live tabs and/or home pins to another space in one pass.
 * Live tabs leave any (now cross-space) unpinned group; home pins keep their
 * data but become loose in the destination.
 */
export interface MoveTabsToSpaceMessage {
  action: 'MOVE_TABS_TO_SPACE';
  payload: {
    spaceId: string;
    tabIds: number[];
    homePinIds: string[];
  } & WindowScopedPayload;
}

/**
 * Move an entire folder to another space, carrying its members with it: a
 * pinned folder's home pins, or an unpinned folder's live tabs. The folder
 * stays intact in the destination space.
 */
export interface MoveGroupToSpaceMessage {
  action: 'MOVE_GROUP_TO_SPACE';
  payload: {
    groupId: string;
    spaceId: string;
  } & WindowScopedPayload;
}

export interface ExportSpaceDataMessage {
  action: 'EXPORT_SPACE_DATA';
  payload: WindowScopedPayload;
}

export interface ImportSpaceDataMessage {
  action: 'IMPORT_SPACE_DATA';
  payload: { data: string } & WindowScopedPayload;
}

export interface ResetSpaceDataMessage {
  action: 'RESET_SPACE_DATA';
  payload: WindowScopedPayload;
}

export interface SwitchSpaceMessage {
  action: 'SWITCH_SPACE';
  payload: { spaceId: string } & WindowScopedPayload;
}

export interface SwitchSpaceByIndexMessage {
  action: 'SWITCH_SPACE_BY_INDEX';
  payload: { index: number } & WindowScopedPayload;
}

export interface CreateSpaceMessage {
  action: 'CREATE_SPACE';
  payload: { name: string; icon?: SpaceIcon } & WindowScopedPayload;
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
    icon?: SpaceIcon;
  } & WindowScopedPayload;
}

export interface DeleteSpaceMessage {
  action: 'DELETE_SPACE';
  payload: { spaceId: string } & WindowScopedPayload;
}

/**
 * Create a fantab group from a selection. A selection that includes any home
 * pins (or mixes pins and tabs) becomes a pinned group; a selection of only
 * live tabs becomes an unpinned group.
 */
export interface CreateGroupMessage {
  action: 'CREATE_GROUP';
  payload: {
    tabIds: number[];
    homePinIds: string[];
    title?: string;
  } & WindowScopedPayload;
}

export interface UpdateGroupMessage {
  action: 'UPDATE_GROUP';
  payload: {
    groupId: string;
    title?: string;
    collapsed?: boolean;
    peek?: boolean;
  } & WindowScopedPayload;
}

export interface MoveToGroupMessage {
  action: 'MOVE_TO_GROUP';
  payload: {
    groupId: string;
    tabId?: number;
    homePinId?: string;
  } & WindowScopedPayload;
}

export interface RemoveFromGroupMessage {
  action: 'REMOVE_FROM_GROUP';
  payload: { tabId?: number; homePinId?: string } & WindowScopedPayload;
}

/**
 * Move a selection of live tabs and/or home pins into a folder. The folder's
 * type drives conversions: a pinned folder pins live tabs as home pins; an
 * unpinned folder turns open home pins into live tabs (closed pins are skipped).
 */
export interface MoveMembersToGroupMessage {
  action: 'MOVE_MEMBERS_TO_GROUP';
  payload: {
    groupId: string;
    tabIds: number[];
    homePinIds: string[];
  } & WindowScopedPayload;
}

/** Remove a selection of live tabs and/or home pins from their folders. */
export interface RemoveMembersFromGroupMessage {
  action: 'REMOVE_MEMBERS_FROM_GROUP';
  payload: {
    tabIds: number[];
    homePinIds: string[];
  } & WindowScopedPayload;
}

export interface PinGroupMessage {
  action: 'PIN_GROUP';
  payload: { groupId: string } & WindowScopedPayload;
}

export interface UnpinGroupMessage {
  action: 'UNPIN_GROUP';
  payload: { groupId: string } & WindowScopedPayload;
}

export interface OpenAllInGroupMessage {
  action: 'OPEN_ALL_IN_GROUP';
  payload: { groupId: string } & WindowScopedPayload;
}

export interface CloseGroupMessage {
  action: 'CLOSE_GROUP';
  payload: { groupId: string } & WindowScopedPayload;
}

export interface DeleteGroupMessage {
  action: 'DELETE_GROUP';
  payload: { groupId: string } & WindowScopedPayload;
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

/**
 * Fire-and-forget report from a content script describing the tab's current
 * media playback (playing state, volume, track metadata, and whether the page
 * supports next/previous track), so the panel can offer picture-in-picture and
 * drive the player bar. Carries no response.
 */
export interface MediaStateChangedMessage {
  action: 'MEDIA_STATE_CHANGED';
  payload: { state: TabMediaState };
}

export interface UrlCopiedMessage {
  action: 'URL_COPIED';
  payload: { tabId: number };
}

export interface ExportSpaceDataResponse {
  filename: string;
  data: string;
}

export type RequestMessage =
  | GetPanelStateMessage
  | CreateTabMessage
  | ActivateTabMessage
  | CloseTabMessage
  | CloseTabsMessage
  | PreserveCloseFocusMessage
  | ReorderSectionMessage
  | SetTabMutedMessage
  | CreateHomePinMessage
  | CreateHomePinsMessage
  | RemoveHomePinMessage
  | RemoveHomePinsMessage
  | EditHomePinUrlMessage
  | RenameTabAliasMessage
  | GoHomeMessage
  | ReopenHomePinMessage
  | MoveTabToSpaceMessage
  | MoveTabsToSpaceMessage
  | MoveGroupToSpaceMessage
  | ExportSpaceDataMessage
  | ImportSpaceDataMessage
  | ResetSpaceDataMessage
  | SwitchSpaceMessage
  | SwitchSpaceByIndexMessage
  | CreateSpaceMessage
  | RenameSpaceMessage
  | UpdateSpaceMessage
  | DeleteSpaceMessage
  | CreateGroupMessage
  | UpdateGroupMessage
  | MoveToGroupMessage
  | MoveMembersToGroupMessage
  | RemoveFromGroupMessage
  | RemoveMembersFromGroupMessage
  | PinGroupMessage
  | UnpinGroupMessage
  | OpenAllInGroupMessage
  | CloseGroupMessage
  | DeleteGroupMessage;

export type ContentRequestMessage =
  | GetLinkRoutingPolicyMessage
  | OpenExternalLinkFromHomePinMessage;

export type BroadcastMessage =
  | PanelStateUpdatedMessage
  | LinkRoutingPolicyUpdatedMessage
  | UrlCopiedMessage;

export type Message =
  | RequestMessage
  | ContentRequestMessage
  | BroadcastMessage
  | MediaStateChangedMessage;
