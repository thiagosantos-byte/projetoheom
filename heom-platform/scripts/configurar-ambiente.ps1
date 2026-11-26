$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Arquivo .env criado a partir de .env.example.' -ForegroundColor Cyan
}

Write-Host ''
Write-Host 'CONFIGURACAO INICIAL DO HEOM' -ForegroundColor Cyan
Write-Host 'O segredo JWT sera gerado localmente e nao sera exibido.'
Write-Host 'A senha administrativa e opcional no modo de demonstracao.'
Write-Host 'Pressione Enter para usar somente os perfis de teste sem senha.'
Write-Host ''

$securePassword = Read-Host 'Senha administrativa individual (opcional)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ($adminPassword -and ($adminPassword.Length -lt 14 -or $adminPassword -notmatch '^[A-Za-z0-9!@#$%_\-]+$')) {
    $securePassword.Dispose()
    throw 'Quando informada, a senha deve ter pelo menos 14 caracteres e usar somente letras, numeros ou ! @ # $ % _ -.'
}

$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
    $jwtSecret = [Convert]::ToBase64String($bytes)
}
finally {
    $rng.Dispose()
}

$adminPasswordConfigured = -not [string]::IsNullOrWhiteSpace($adminPassword)
$lines = Get-Content '.env'
$jwtFound = $false
$passwordFound = $false
$updatedLines = foreach ($line in $lines) {
    if ($line -match '^JWT_SECRET=') {
        $jwtFound = $true
        "JWT_SECRET=$jwtSecret"
    }
    elseif ($line -match '^INITIAL_ADMIN_PASSWORD=') {
        $passwordFound = $true
        ('INITIAL_ADMIN_PASSWORD="{0}"' -f $adminPassword)
    }
    else {
        $line
    }
}

if (-not $jwtFound) { throw 'A chave JWT_SECRET nao foi encontrada no .env.' }
if (-not $passwordFound) { throw 'A chave INITIAL_ADMIN_PASSWORD nao foi encontrada no .env.' }

Set-Content -Path '.env' -Value $updatedLines -Encoding UTF8
$adminPassword = $null
$securePassword.Dispose()

Write-Host ''
Write-Host 'Configuracao concluida.' -ForegroundColor Green
Write-Host 'JWT_SECRET: gerado localmente (nao exibido).'
if ($adminPasswordConfigured) { Write-Host 'INITIAL_ADMIN_PASSWORD: configurada.' } else { Write-Host 'INITIAL_ADMIN_PASSWORD: nao configurada; use os perfis de teste sem senha.' }
Write-Host 'Agora execute: powershell -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1' -ForegroundColor Yellow
