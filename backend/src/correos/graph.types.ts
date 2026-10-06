/**
 * Tipos de las respuestas de Microsoft Graph que consume el modulo de correos.
 * Solo se declaran los campos que realmente se usan: pedir de mas encarece la
 * respuesta y en los listados el `body` puede pesar hasta ~1 MB por mensaje.
 */

export interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

/**
 * Remitente o destinatario de un mensaje. OJO: en Graph esto NO es un
 * `emailAddress` pelado, es un `recipient` que lo envuelve, por eso hay que
 * leer `from.emailAddress.address` y no `from.address`.
 */
export interface GraphRecipient {
  emailAddress?: GraphEmailAddress | null;
}

/** Subconjunto de mailFolder. `id` es opaco: hay que URL-encodearlo. */
export interface GraphMailFolder {
  id: string;
  displayName?: string | null;
  parentFolderId?: string | null;
  childFolderCount?: number;
  totalItemCount?: number;
  unreadItemCount?: number;
  wellKnownName?: string | null;
  isHidden?: boolean;
}

/** Listado sin cuerpo: es el que se pide para pintar la bandeja. */
export interface GraphMessageListItem {
  id: string;
  subject?: string | null;
  from?: GraphRecipient | null;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  isRead?: boolean;
  hasAttachments?: boolean;
  bodyPreview?: string | null;
  conversationId?: string | null;
  internetMessageId?: string | null;
  importance?: string | null;
  replyTo?: GraphRecipient[];
  /**
   * Categorias de Outlook asignadas al mensaje (las que se crean en el cliente
   * de Outlook). Viene como arreglo de texto y llega vacio cuando el correo
   * todavia no esta clasificado.
   */
  categories?: string[] | null;
  /** Lo devuelve messages/delta cuando un mensaje fue borrado o movido. */
  '@removed'?: { reason: string };
}

export interface GraphMessage extends GraphMessageListItem {
  body?: { contentType?: string | null; content?: string | null } | null;
  uniqueBody?: { content?: string | null } | null;
  replyTo?: GraphRecipient[];
}

export interface GraphAttachment {
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number;
  isInline?: boolean;
  /**
   * Content-ID MIME de las imagenes embebidas. Es el valor (sin el prefijo
   * `cid:`) al que apunta el `src` del HTML del correo. No pertenece al tipo
   * base `microsoft.graph.attachment`, asi que en `$select` hay que pedirlo con
   * el cast: `microsoft.graph.fileAttachment/contentId`.
   */
  contentId?: string | null;
  '@odata.type'?: string;
}

export interface GraphUser {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean;
}

/** Envoltura de coleccion de Graph, con los enlaces de paginacion/delta. */
export interface GraphCollection<T> {
  value?: T[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/**
 * Propiedades del mensaje que se piden en el delta. El cuerpo NO se incluye a
 * proposito: el espejo local guarda metadatos y el HTML se pide bajo demanda.
 */
export const GRAPH_MESSAGE_SELECT = [
  'id',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'isRead',
  'hasAttachments',
  'bodyPreview',
  'conversationId',
  'importance',
  'internetMessageId',
  'replyTo',
  'categories',
].join(',');
