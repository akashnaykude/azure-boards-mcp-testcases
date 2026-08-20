import http from 'node:http';

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    name: 'azure-boards-mcp-testcases',
    status: 'starter',
    message: 'MCP server placeholder is running',
    hint: 'Connect Azure Boards REST API here and expose ticket fetch tools.'
  }));
});

server.listen(port, () => {
  console.log(`Starter server running on port ${port}`);
});
