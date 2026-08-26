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

function Normalize-Turma([string]$turma) {
  $t = $turma.Trim()
  if ($t -match '\d\s*º?\s*ANO' -or $t -match '(?i)^\d+\s*ANO') { return "ÚNICA" }
  if ($t -match '(?i)^unica$' -or $t -match '(?i)^única$') { return "ÚNICA" }
  if (Is-Unica $t) { return "ÚNICA" }
  if ($t -match '(?i)NICA$' -and $t -notmatch '^[A-Z]$') { return "ÚNICA" }
  return $t.ToUpper()
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

  $habilidades = [ordered]@{}
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

function Same-Profile($a, $b) {
  if ($null -eq $a -or $null -eq $b) { return $false }
  return (
    $a.acertoTotal -eq $b.acertoTotal -and
    $a.defasagemPct -eq $b.defasagemPct -and
    $a.intermediarioPct -eq $b.intermediarioPct -and
    $a.adequadoPct -eq $b.adequadoPct
  )
}

function Next-TurmaLetter([string[]]$used) {
  foreach ($letter in @("A", "B", "C", "D", "E", "F")) {
    if ($used -notcontains $letter) { return $letter }
  }
  return "ÚNICA"
}

function Is-Unica([string]$turma) {
  if ([string]::IsNullOrWhiteSpace($turma)) { return $false }
  $plain = [Text.Encoding]::ASCII.GetString(
    [Text.Encoding]::GetEncoding("ISO-8859-1").GetBytes(($turma.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''))
  )
  return ($plain -match '(?i)^unica$')
}

function Prefer-Turma([string]$a, [string]$b) {
  if ((Is-Unica $a) -or (Is-Unica $b)) { return "ÚNICA" }
  if ($a) { return $a }
  return $b
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
    $n = [double]$obj
    if ([Math]::Abs($n - [Math]::Round($n)) -lt 0.0000001) {
      return ([int][Math]::Round($n)).ToString()
    }
    return $n.ToString([System.Globalization.CultureInfo]::InvariantCulture)
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
$warnings = New-Object System.Collections.Generic.List[string]

Get-ChildItem -Path $root -Filter "*.csv" | ForEach-Object {
  $name = $_.Name
  if ($name -notmatch '^(\d).*? - (.+?) - CICLO ([IV]+)\.csv$') { return }

  $ano = $Matches[1]
  $disciplinaNome = $Matches[2]
  $ciclo = $Matches[3]
  $disciplina = if ($disciplinaNome -like "*MATEM*") { "mat" } else { "lp" }
  $periodo = if ($ciclo -eq "I") { "entrada" } else { "percurso" }

  $lines = Get-Content -Path $_.FullName -Encoding UTF8
  $fileRows = [ordered]@{}
  $csvPrev = 0
  $csvAv = 0

  for ($lineIndex = 1; $lineIndex -lt $lines.Count; $lineIndex++) {
    $line = $lines[$lineIndex].Trim()
    if ($line -eq "" -or $line -match '^;+$') { continue }
    if ($line -like "TOTAL GERAL*") {
      $tp = $line -split ';'
      $csvPrev = [int](Parse-Num $tp[2])
      $csvAv = [int](Parse-Num $tp[3])
      continue
    }

    $parts = $line -split ';'
    if ($parts.Count -lt 9 -or [string]::IsNullOrWhiteSpace($parts[0]) -or [string]::IsNullOrWhiteSpace($parts[1])) { continue }

    $escola = Normalize-School $parts[0]
    $turma = Normalize-Turma $parts[1]
    $bloco = Build-Bloco $parts
    $rowKey = "{0}|{1}" -f $escola, $turma

    if ($fileRows.Contains($rowKey)) {
      $existing = $fileRows[$rowKey]
      if (Same-Profile $existing $bloco) {
        if (
          $bloco.avaliados -gt $existing.avaliados -or
          ($bloco.avaliados -eq $existing.avaliados -and $bloco.previstos -le $existing.previstos)
        ) {
          $fileRows[$rowKey] = $bloco
        }
        $warnings.Add(("{0}: duplicata similar {1} {2} (mantida 1)" -f $name, $escola, $turma)) | Out-Null
        continue
      }

      $used = @(
        $fileRows.Keys | ForEach-Object { ($_ -split '\|', 2)[1] }
      )
      $newTurma = Next-TurmaLetter $used
      $rowKey = "{0}|{1}" -f $escola, $newTurma
      $warnings.Add(("{0}: {1} turma {2} renomeada para {3}" -f $name, $escola, $turma, $newTurma)) | Out-Null
      $turma = $newTurma
    }

    $fileRows[$rowKey] = $bloco
  }

  $sumPrev = 0
  $sumAv = 0
  foreach ($rowKey in @($fileRows.Keys)) {
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
    $sumPrev += $previstos
    $sumAv += [int]$fileRows[$rowKey].avaliados
  }

  if ($csvPrev -gt 0 -or $csvAv -gt 0) {
    $msg = ("{0}: CSV TOTAL prev={1} av={2} | importado prev={3} av={4}" -f $name, $csvPrev, $csvAv, $sumPrev, $sumAv)
    if ($csvPrev -ne $sumPrev -or $csvAv -ne $sumAv) {
      $warnings.Add(("DIFERENÇA {0}" -f $msg)) | Out-Null
    } else {
      Write-Host ("OK {0}" -f $msg)
    }
  } else {
    Write-Host ("{0}: importado prev={1} av={2}" -f $name, $sumPrev, $sumAv)
  }
}

# Une Ciclo I/II quando a mesma escola mudou letra <-> ÚNICA
$groups = $records.Values | Group-Object { "{0}|{1}|{2}" -f $_.ano, $_.disciplina, $_.escola }
foreach ($g in $groups) {
  $onlyEnt = @($g.Group | Where-Object { $_.entrada -ne $null -and $_.percurso -eq $null })
  $onlyPerc = @($g.Group | Where-Object { $_.entrada -eq $null -and $_.percurso -ne $null })
  if ($onlyEnt.Count -eq 1 -and $onlyPerc.Count -eq 1) {
    $a = $onlyEnt[0]
    $b = $onlyPerc[0]
    $turma = Prefer-Turma $a.turma $b.turma
    $a.percurso = $b.percurso
    $a.turma = $turma
    if ($b.alunos -gt $a.alunos) { $a.alunos = $b.alunos }
    $oldKey = "{0}|{1}|{2}|{3}" -f $b.ano, $b.disciplina, $b.escola, $b.turma
    $newKey = "{0}|{1}|{2}|{3}" -f $a.ano, $a.disciplina, $a.escola, $a.turma
    $records.Remove($oldKey)
    if ($records.ContainsKey($newKey) -eq $false -or $records[$newKey] -ne $a) {
      $oldAKey = "{0}|{1}|{2}|{3}" -f $onlyEnt[0].ano, $onlyEnt[0].disciplina, $onlyEnt[0].escola, $onlyEnt[0].turma
      # reindex if turma changed
      $keysToRemove = @($records.Keys | Where-Object {
        $r = $records[$_]
        $r -eq $a -and $_ -ne $newKey
      })
      foreach ($k in $keysToRemove) { $records.Remove($k) }
      $records[$newKey] = $a
    }
    $warnings.Add(("MERGE {0} {1} {2}: {3}+{4} -> {5}" -f $a.ano, $a.disciplina, $a.escola, $onlyEnt[0].turma, $onlyPerc[0].turma, $turma)) | Out-Null
  }
}

$ordered = @($records.Values | Sort-Object {
  "{0}|{1}|{2}|{3}" -f $_.ano, $_.disciplina, $_.escola, $_.turma
})

$output = "const DADOS = " + (ConvertTo-CompactJson $ordered) + ";`n"
$target = Join-Path $root "dados.js"
[System.IO.File]::WriteAllText($target, $output, [System.Text.UTF8Encoding]::new($false))
Write-Host ("`nGerado {0} registros em {1}" -f $ordered.Count, $target)

if ($warnings.Count -gt 0) {
  Write-Host "`nAvisos:"
  $warnings | ForEach-Object { Write-Host (" - {0}" -f $_) }
}
