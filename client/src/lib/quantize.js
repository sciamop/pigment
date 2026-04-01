const MAX_SAMPLE = 60000

function distSq(a, b) {
  const dr = a[0]-b[0], dg = a[1]-b[1], db = a[2]-b[2]
  return dr*dr + dg*dg + db*db
}

// k-means++ seeding — much better starting points than random
function kmeanspp(pixels, k) {
  const n = pixels.length
  const centroids = [pixels[Math.floor(Math.random() * n)].slice()]
  const dists = new Float32Array(n).fill(Infinity)

  for (let c = 1; c < k; c++) {
    // Update min distances against the most recently added centroid
    const prev = centroids[c - 1]
    let total = 0
    for (let i = 0; i < n; i++) {
      const d = distSq(pixels[i], prev)
      if (d < dists[i]) dists[i] = d
      total += dists[i]
    }
    // Pick next centroid weighted by distance²
    let r = Math.random() * total
    let idx = n - 1
    for (let i = 0; i < n; i++) {
      r -= dists[i]
      if (r <= 0) { idx = i; break }
    }
    centroids.push(pixels[idx].slice())
  }

  return centroids
}

function kmeans(pixels, k) {
  const n = pixels.length
  // Fewer iterations needed as k grows — k-means++ seeding is close to optimal
  const maxIter = Math.max(6, Math.round(20 * 16 / k))
  let centroids = kmeanspp(pixels, k)

  // Flat centroid buffer for tight inner loop
  const cf = new Float32Array(k * 3)
  const writeFlat = cs => cs.forEach((c, i) => { cf[i*3]=c[0]; cf[i*3+1]=c[1]; cf[i*3+2]=c[2] })
  writeFlat(centroids)

  const assignments = new Int32Array(n)

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false

    // Assign each sample pixel to nearest centroid
    for (let i = 0; i < n; i++) {
      const r = pixels[i][0], g = pixels[i][1], b = pixels[i][2]
      let best = 0, bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dr = r-cf[c*3], dg = g-cf[c*3+1], db = b-cf[c*3+2]
        const d = dr*dr + dg*dg + db*db
        if (d < bestD) { bestD = d; best = c }
      }
      if (best !== assignments[i]) { assignments[i] = best; changed = true }
    }

    if (!changed) break

    // Recompute centroids
    const sr = new Float32Array(k), sg = new Float32Array(k), sb = new Float32Array(k)
    const counts = new Int32Array(k)
    for (let i = 0; i < n; i++) {
      const c = assignments[i]
      sr[c] += pixels[i][0]; sg[c] += pixels[i][1]; sb[c] += pixels[i][2]
      counts[c]++
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        cf[c*3]   = sr[c] / counts[c]
        cf[c*3+1] = sg[c] / counts[c]
        cf[c*3+2] = sb[c] / counts[c]
      }
    }
  }

  // Round to integer RGB
  const result = []
  for (let c = 0; c < k; c++) {
    result.push([Math.round(cf[c*3]), Math.round(cf[c*3+1]), Math.round(cf[c*3+2])])
  }
  return result
}

function toHex(rgb) {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}

export function quantizeImage(imageData, k = 16) {
  const { data, width, height } = imageData

  // Collect opaque pixels
  const all = []
  for (let i = 0; i < data.length; i += 4) {
    if (data[i+3] > 128) all.push([data[i], data[i+1], data[i+2]])
  }

  // Sample for clustering
  const step = Math.max(1, Math.floor(all.length / MAX_SAMPLE))
  const sample = all.filter((_, i) => i % step === 0)

  const centroids = kmeans(sample, Math.min(k, sample.length))

  // Build flat centroid array for fast per-pixel assignment
  const cf = new Float32Array(centroids.length * 3)
  centroids.forEach((c, i) => { cf[i*3]=c[0]; cf[i*3+1]=c[1]; cf[i*3+2]=c[2] })

  const counts  = new Int32Array(centroids.length)
  const result  = new Uint8ClampedArray(data.length)
  const n       = width * height

  for (let i = 0; i < n; i++) {
    const di = i * 4
    result[di+3] = data[di+3]
    if (data[di+3] > 128) {
      const r = data[di], g = data[di+1], b = data[di+2]
      let best = 0, bestD = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const dr = r-cf[c*3], dg = g-cf[c*3+1], db = b-cf[c*3+2]
        const d = dr*dr + dg*dg + db*db
        if (d < bestD) { bestD = d; best = c }
      }
      counts[best]++
      result[di]   = centroids[best][0]
      result[di+1] = centroids[best][1]
      result[di+2] = centroids[best][2]
    }
  }

  const total = counts.reduce((a, b) => a + b, 0)

  return {
    imageData: new ImageData(result, width, height),
    palette: centroids
      .map((rgb, i) => ({ rgb, hex: toHex(rgb), coverage: counts[i] / total }))
      .filter(p => p.coverage > 0)
      .sort((a, b) => b.coverage - a.coverage)
  }
}
