import { createChannel } from '../../core/channel-factory'
import type { Channel } from '../../core/types'
import { modelscopeConfig } from './config'
import { modelscopeEdit } from './edit'
import { modelscopeImage } from './image'
import { modelscopeLLM } from './llm'

export const modelscopeChannel: Channel = createChannel({
  id: 'modelscope',
  name: 'ModelScope',
  config: modelscopeConfig,
  image: modelscopeImage,
  imageEdit: modelscopeEdit,
  llm: modelscopeLLM,
})
