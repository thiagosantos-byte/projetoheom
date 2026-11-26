$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22.x.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm não foi encontrado.' }
npm run dev
if ($LASTEXITCODE -ne 0) { throw 'O HEOM foi encerrado com erro. Verifique as mensagens acima.' }
