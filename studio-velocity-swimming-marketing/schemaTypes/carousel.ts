import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'carousel',
  title: 'Carousel',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Carousel Name',
      type: 'string',
      description: 'Internal name for the carousel (e.g. "Youth Development", "Audrey Hyde")',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'images',
      title: 'Images',
      type: 'array',
      of: [{type: 'image', options: {hotspot: true}}],
      description: 'Add photos to this carousel. You can select existing photos from the library or upload new ones.',
    }),
  ],
})
