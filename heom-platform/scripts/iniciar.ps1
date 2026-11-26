$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não foi encontrado. Instale uma versão LTS compatível.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm não foi encontrado. Reinstale o Node.js incluindo npm.' }

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    throw 'Arquivo .env criado. Execute scripts/configurar-ambiente.ps1 para gerar JWT_SECRET; a senha administrativa é opcional no modo de teste.'
}

$envLines = Get-Content '.env'
$jwtLine = $envLines | Where-Object { $_ -match '^JWT_SECRET=' } | Select-Object -First 1
$adminLine = $envLines | Where-Object { $_ -match '^INITIAL_ADMIN_PASSWORD=' } | Select-Object -First 1
if (-not $jwtLine -or $jwtLine.Length -lt 45 -or $jwtLine -match 'SUBSTITUA_POR_') { throw 'JWT_SECRET ausente ou muito curto. Execute o configurador de ambiente.' }
$demoLine = $envLines | Where-Object { $_ -match '^ENABLE_DEMO_PROFILES=' } | Select-Object -First 1
if ((-not $adminLine -or $adminLine -notmatch '^INITIAL_ADMIN_PASSWORD=.{14,}$') -and $demoLine -notmatch '^ENABLE_DEMO_PROFILES=true$') { throw 'Configure uma senha administrativa ou habilite ENABLE_DEMO_PROFILES=true para entrar pelos cartões sem senha.' }

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Instalando dependências npm...' -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências npm.' }
}

node -e "try { require('esbuild'); process.exit(0) } catch { process.exit(1) }"
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Preparando o esbuild para o Vite...' -ForegroundColor Cyan
    npm install-scripts approve esbuild
    if ($LASTEXITCODE -ne 0) { throw 'Aprove o postinstall do esbuild com: npm install-scripts approve esbuild' }
    npm rebuild esbuild
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao reconstruir o esbuild.' }
}

Write-Host 'Iniciando HEOM em modo demonstrativo local, sem Docker...' -ForegroundColor Cyan
Write-Host 'Persistência: arquivo JSON local em apps/api/data/heom-demo.json'
Write-Host 'Rastreamento: simulador interno, sem MQTT ou hardware real'
Write-Host 'Interface: http://localhost:5173'
Write-Host 'API:       http://localhost:4000/api/health'
Write-Host 'Pressione Ctrl+C para encerrar.'
Write-Host ''
npm run dev:local
if ($LASTEXITCODE -ne 0) { throw 'O HEOM foi encerrado com erro. Verifique as mensagens acima.' }
