$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Parse-Num([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return 0 }
  $text = $value.Trim().Replace(",", ".").Replace("%", "")
  if ($text -eq "") { return 0 }
  return [double]$text
}

function Normalize-School([string]$raw) {
  $name = $raw.Trim()
  $name = $name -replace "^\s*EMEIF\s+", ""
  $name = $name -replace "\s*-\s*\d+\s*$", ""
  return ("E.M.E.I.F. {0}" -f $name.Trim())
}

function Build-Bloco([string[]]$parts) {
  $previstos = [int](Parse-Num $parts[2])
  $avaliados = [int](Parse-Num $parts[3])
  $participacao = [Math]::Round((Parse-Num $parts[4]), 1)
  $acertoTotal = [Math]::Round((Parse-Num $parts[5]), 1)
  $defPct = Parse-Num $parts[6]
  $interPct = Parse-Num $parts[7]
  $adePct = Parse-Num $parts[8]

  $defasagem = 0
  $intermediario = 0
  $adequado = 0
  if ($avaliados -gt 0) {
    $defasagem = [int][Math]::Round($avaliados * $defPct / 100)
    $intermediario = [int][Math]::Round($avaliados * $interPct / 100)
    $adequado = $avaliados - $defasagem - $intermediario
    if ($adequado -lt 0) {
      $adequado = 0
      $intermediario = [Math]::Max(0, $avaliados - $defasagem)
    }
  }

  $habilidades = @{}
  for ($i = 9; $i -lt $parts.Count; $i++) {
    if ([string]::IsNullOrWhiteSpace($parts[$i])) { continue }
    $habilidades[("h{0:D2}" -f ($i - 8))] = [Math]::Round((Parse-Num $parts[$i]), 1)
  }

  return [ordered]@{
    previstos = $previstos
    avaliados = $avaliados
    participacao = $participacao
    acertoTotal = $acertoTotal
    defasagem = $defasagem
    intermediario = $intermediario
    adequado = $adequado
    defasagemPct = [Math]::Round($defPct, 1)
    intermediarioPct = [Math]::Round($interPct, 1)
    adequadoPct = [Math]::Round($adePct, 1)
    habilidades = $habilidades
  }
}

function ConvertTo-CompactJson($obj) {
  if ($null -eq $obj) { return "null" }
  if ($obj -is [string]) {
    $escaped = $obj.Replace("\", "\\").Replace('"', '\"')
    return '"' + $escaped + '"'
  }
  if ($obj -is [bool]) { return ($(if ($obj) { "true" } else { "false" })) }
  if ($obj -is [int] -or $obj -is [long]) { return "$obj" }
  if ($obj -is [double] -or $obj -is [decimal] -or $obj -is [float]) {
    $text = [string]$obj
    if ($text -match "\.") { return $text.TrimEnd("0").TrimEnd(".") }
    return $text
  }
  if ($obj -is [System.Collections.IDictionary]) {
    $pairs = @()
    foreach ($key in $obj.Keys) {
      $pairs += ('"{0}":{1}' -f $key, (ConvertTo-CompactJson $obj[$key]))
    }
    return "{" + ($pairs -join ",") + "}"
  }
  if ($obj -is [System.Collections.IEnumerable] -and -not ($obj -is [string])) {
    $items = @()
    foreach ($item in $obj) { $items += (ConvertTo-CompactJson $item) }
    return "[" + ($items -join ",") + "]"
  }
  return ConvertTo-CompactJson ([string]$obj)
}

$records = @{}

Get-ChildItem -Path $root -Filter "*.csv" | ForEach-Object {
  $name = $_.Name
  if ($name -notmatch '^(\d).*? - (.+?) - CICLO ([IV]+)\.csv$') { return }

  $ano = $Matches[1]
  $disciplinaNome = $Matches[2]
  $ciclo = $Matches[3]
  $disciplina = if ($disciplinaNome -like "*MATEM*") { "mat" } else { "lp" }
  $periodo = if ($ciclo -eq "I") { "entrada" } else { "percurso" }

  $lines = Get-Content -Path $_.FullName -Encoding UTF8
  $fileRows = @{}

  for ($lineIndex = 1; $lineIndex -lt $lines.Count; $lineIndex++) {
    $line = $lines[$lineIndex].Trim()
    if ($line -eq "" -or $line -match '^;+$' -or $line -like "TOTAL GERAL*") { continue }

    $parts = $line -split ';'
    if ($parts.Count -lt 9 -or [string]::IsNullOrWhiteSpace($parts[0]) -or [string]::IsNullOrWhiteSpace($parts[1])) { continue }

    $escola = Normalize-School $parts[0]
    $turma = $parts[1].Trim()
    $rowKey = "{0}|{1}" -f $escola, $turma
    $bloco = Build-Bloco $parts

    if ($fileRows.ContainsKey($rowKey)) {
      $existing = $fileRows[$rowKey]
      if ($bloco.avaliados -lt $existing.avaliados) { continue }
    }
    $fileRows[$rowKey] = $bloco
  }

  foreach ($rowKey in $fileRows.Keys) {
    $escola, $turma = $rowKey -split '\|', 2
    $recordKey = "{0}|{1}|{2}|{3}" -f $ano, $disciplina, $escola, $turma
    if (-not $records.ContainsKey($recordKey)) {
      $records[$recordKey] = [ordered]@{
        ano = $ano
        disciplina = $disciplina
        escola = $escola
        turma = $turma
        alunos = 0
        entrada = $null
        percurso = $null
      }
    }

    $records[$recordKey][$periodo] = $fileRows[$rowKey]
    $previstos = [int]$fileRows[$rowKey].previstos
    if ($previstos -gt $records[$recordKey].alunos) {
      $records[$recordKey].alunos = $previstos
    }
  }
}

$ordered = $records.Values | Sort-Object {
  "{0}|{1}|{2}|{3}" -f $_.disciplina, $_.ano, $_.escola, $_.turma
}

$output = "const DADOS = " + (ConvertTo-CompactJson $ordered) + ";`n"
$target = Join-Path $root "dados.js"
[System.IO.File]::WriteAllText($target, $output, [System.Text.UTF8Encoding]::new($false))
Write-Host ("Gerado {0} registros em {1}" -f $ordered.Count, $target)
