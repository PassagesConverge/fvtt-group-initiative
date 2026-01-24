# FoundryVTT Module Release Packager
# This script packages the module for GitHub release

param(
    [string]$OutputDir = ".\release",
    [switch]$SkipValidation
)

# Color output functions
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

# Get module information
$moduleJsonPath = ".\module.json"
if (-not (Test-Path $moduleJsonPath)) {
    Write-Error "Error: module.json not found in current directory"
    exit 1
}

Write-Info "Reading module.json..."
$moduleJson = Get-Content $moduleJsonPath -Raw | ConvertFrom-Json
$moduleId = $moduleJson.id
$version = $moduleJson.version
$moduleName = "fvtt-group-initiative"

Write-Info "Module: $($moduleJson.title)"
Write-Info "ID: $moduleId"
Write-Info "Version: $version"

# Validate module.json URLs
if (-not $SkipValidation) {
    Write-Info ""
    Write-Info "Validating URLs..."
    
    $expectedManifest = "https://github.com/PassagesConverge/fvtt-group-initiative/releases/latest/download/module.json"
    $expectedDownload = "https://github.com/PassagesConverge/fvtt-group-initiative/releases/latest/download/$moduleName.zip"
    
    if ($moduleJson.manifest -ne $expectedManifest) {
        Write-Warning "Warning: manifest URL doesn't use /latest/download/"
        Write-Warning "  Current: $($moduleJson.manifest)"
        Write-Warning "  Expected: $expectedManifest"
    }
    
    if ($moduleJson.download -ne $expectedDownload) {
        Write-Warning "Warning: download URL doesn't use /latest/download/"
        Write-Warning "  Current: $($moduleJson.download)"
        Write-Warning "  Expected: $expectedDownload"
    }
}

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Success "Created output directory: $OutputDir"
}

# Define files/folders to exclude from the package
$excludePatterns = @(
    "release",
    "*.ps1",
    ".git",
    ".gitignore",
    ".github",
    "*.zip",
    "node_modules",
    ".vscode"
)

Write-Info ""
Write-Info "Preparing files for packaging..."

# Create temporary directory with module folder structure
$tempDir = Join-Path $env:TEMP "fvtt-module-temp"
$moduleDir = Join-Path $tempDir $moduleName

if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $moduleDir -Force | Out-Null

# Copy files to temp directory
Get-ChildItem -Path "." -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring((Get-Location).Path.Length + 1)
    
    # Check if path matches any exclude pattern
    $shouldExclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($relativePath -like "$pattern*") {
            $shouldExclude = $true
            break
        }
    }
    
    if (-not $shouldExclude) {
        $destPath = Join-Path $moduleDir $relativePath
        
        if ($_.PSIsContainer) {
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
        } else {
            $destDir = Split-Path $destPath
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            Copy-Item $_.FullName -Destination $destPath -Force
        }
    }
}

# Create the ZIP file
$zipName = "$moduleName.zip"
$zipPath = Join-Path $OutputDir $zipName

if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Write-Info "Creating ZIP archive: $zipName"
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Copy module.json to output directory
$moduleJsonDest = Join-Path $OutputDir "module.json"
Copy-Item $moduleJsonPath -Destination $moduleJsonDest -Force

# Cleanup temp directory
Remove-Item $tempDir -Recurse -Force

# Display results
Write-Success ""
Write-Success "Package created successfully!"
Write-Info ""
Write-Info "Release files created in: $OutputDir"
Write-Info "  - module.json"
Write-Info "  - $zipName"

$zipSize = (Get-Item $zipPath).Length
$sizeKB = [math]::Round($zipSize / 1KB, 2)
Write-Info ""
Write-Info "Package size: $sizeKB KB"

Write-Info ""
Write-Info "--- Next Steps ---"
Write-Info "1. Commit and push your changes to GitHub"
Write-Info "2. Create a new release at: https://github.com/PassagesConverge/fvtt-group-initiative/releases/new"
Write-Info "3. Tag the release as: v$version"
Write-Info "4. Upload both files from the 'release' directory:"
Write-Info "   - module.json"
Write-Info "   - $zipName"
Write-Info "5. Publish the release"
Write-Info ""
Write-Info "Manifest URL for Foundry: $($moduleJson.manifest)"
