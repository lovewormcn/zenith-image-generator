import type {
  Channel,
  ChannelConfig,
  ImageCapability,
  ImageEditCapability,
  LLMCapability,
  VideoCapability,
} from './types'

export function createChannel(input: {
  id: string
  name: string
  config: ChannelConfig
  image?: ImageCapability
  imageEdit?: ImageEditCapability
  llm?: LLMCapability
  video?: VideoCapability
}): Channel {
  return {
    id: input.id,
    name: input.name,
    config: input.config,
    ...(input.image && { image: input.image }),
    ...(input.imageEdit && { imageEdit: input.imageEdit }),
    ...(input.llm && { llm: input.llm }),
    ...(input.video && { video: input.video }),
  }
}
