export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(","),
    ...data.map(row => 
      headers.map(header => {
        let cell = row[header]
        if (cell === null || cell === undefined) cell = ""
        if (typeof cell === "object") cell = JSON.stringify(cell)
        cell = String(cell).replace(/"/g, '""')
        return `"${cell}"`
      }).join(",")
    )
  ].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.setAttribute("href", url)
  link.setAttribute("download", filename)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
