import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://aboutvelocityswimming.com'

  return [
    ...['schedule', 'news', 'tools', 'store', 'sponsors'].map((route) => ({
      url: `${baseUrl}/${route}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.8,
    },
  ]
}
