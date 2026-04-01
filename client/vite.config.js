export default {
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3035'
    }
  }
}
