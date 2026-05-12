import type { ExtensionToolEntry } from '../../../../ProjectRose/src/shared/extension-contract'
import { SITE_PARAM, listConfiguredSites } from './tools/shared'
import { PAGE_TOOLS } from './tools/pages'
import { FILE_TOOLS } from './tools/files'
import { USER_TOOLS } from './tools/users'
import { GROUP_TOOLS } from './tools/groups'
import { TOPIC_TOOLS } from './tools/topics'
import { SYSTEM_TOOLS } from './tools/system'

const SITES_TOOLS: ExtensionToolEntry[] = [
  {
    name: 'ccms_list_sites',
    description: 'List all Concrete CMS sites configured in this project. Shows each site\'s name (use this in the "site" parameter of other tools), base URL, client ID, granted scopes, and discovered page types.',
    schema: { type: 'object', properties: {} },
    execute: (_input, projectRoot) => listConfiguredSites(projectRoot)
  }
]

void SITE_PARAM

export const CCMS_TOOLS: ExtensionToolEntry[] = [
  ...SITES_TOOLS,
  ...SYSTEM_TOOLS,
  ...PAGE_TOOLS,
  ...FILE_TOOLS,
  ...USER_TOOLS,
  ...GROUP_TOOLS,
  ...TOPIC_TOOLS
]
