import {defineType, defineField} from 'sanity'

export default defineType({
  name: 'pagePhotos',
  title: 'Page Photos',
  type: 'document',
  fields: [
    defineField({
      name: 'heroImage',
      title: 'Hero Background Image',
      type: 'image',
      options: { hotspot: true },
      description: 'The main background image at the top of the homepage.',
    }),
    defineField({
      name: 'athleteSpotlightImage',
      title: 'Athlete Spotlight Image',
      type: 'image',
      options: { hotspot: true },
      description: 'The image used for the Athlete Spotlight section.',
    }),
    defineField({
      name: 'beyondThePoolImage',
      title: 'Beyond the Pool Image',
      type: 'image',
      options: { hotspot: true },
      description: 'The image used for the Beyond the Pool section.',
    }),
    defineField({
      name: 'mastersProgramImage',
      title: 'Masters Program Image',
      type: 'image',
      options: { hotspot: true },
      description: 'The image used for the Masters / Lifelong Fitness section.',
    }),
  ],
})
