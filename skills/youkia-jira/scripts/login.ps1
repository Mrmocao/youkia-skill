param(
    [string]$BaseUrl = 'http://log.youkia.com:8084',
    [Parameter(Mandatory = $true)][string]$StateDirectory
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.Security
[System.Windows.Forms.Application]::EnableVisualStyles()

function Get-JiraBaseUrl {
    param([string]$Value)
    $candidateUri = $null
    if (-not [Uri]::TryCreate($Value.Trim(), [UriKind]::Absolute, [ref]$candidateUri) -or
        $candidateUri.Scheme -notin @('http', 'https') -or
        $candidateUri.UserInfo -or $candidateUri.Query -or $candidateUri.Fragment) {
        throw 'INVALID_JIRA_URL'
    }
    return $candidateUri.AbsoluteUri.TrimEnd('/')
}

$script:loginResult = [ordered]@{ status = 'cancelled'; saved = $false }
$script:pendingRequest = $null
$script:requestMessage = $null
$script:attemptSecret = $null
$script:attemptContext = $null
$httpHandler = New-Object System.Net.Http.HttpClientHandler
$httpHandler.AllowAutoRedirect = $false
$script:httpClient = New-Object System.Net.Http.HttpClient($httpHandler)
$script:httpClient.Timeout = [TimeSpan]::FromSeconds(25)
$script:httpClient.DefaultRequestHeaders.Accept.ParseAdd('application/json')

$form = New-Object System.Windows.Forms.Form
$form.Text = 'youkia JIRA助手｜登录'
$form.ClientSize = New-Object System.Drawing.Size(640,440)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.AutoScaleMode = 'Dpi'
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI',10)

function Add-JiraLabel {
    param([string]$Text, [int]$Top, [int]$Width = 104)
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Location = New-Object System.Drawing.Point(24,$Top)
    $label.Size = New-Object System.Drawing.Size($Width,28)
    $form.Controls.Add($label)
    return $label
}

$intro = Add-JiraLabel '请选择登录方式，并填写相应信息。' 20 590
$addressLabel = Add-JiraLabel 'Jira 网址' 72
$addressBox = New-Object System.Windows.Forms.TextBox
$addressBox.Location = New-Object System.Drawing.Point(138,68)
$addressBox.Size = New-Object System.Drawing.Size(476,30)
$addressBox.Text = $BaseUrl
$addressBox.TabIndex = 0
$form.Controls.Add($addressBox)

$modeLabel = Add-JiraLabel '登录方式' 120
$modeBox = New-Object System.Windows.Forms.ComboBox
$modeBox.Location = New-Object System.Drawing.Point(138,116)
$modeBox.Size = New-Object System.Drawing.Size(476,30)
$modeBox.DropDownStyle = 'DropDownList'
[void]$modeBox.Items.Add('账号密码')
[void]$modeBox.Items.Add('Token（个人访问令牌）')
$modeBox.SelectedIndex = 0
$modeBox.TabIndex = 1
$form.Controls.Add($modeBox)

$usernameLabel = Add-JiraLabel '登录账号' 168
$usernameBox = New-Object System.Windows.Forms.TextBox
$usernameBox.Location = New-Object System.Drawing.Point(138,164)
$usernameBox.Size = New-Object System.Drawing.Size(476,30)
$usernameBox.TabIndex = 2
$form.Controls.Add($usernameBox)

$secretLabel = Add-JiraLabel '登录密码' 216
$secretBox = New-Object System.Windows.Forms.TextBox
$secretBox.Location = New-Object System.Drawing.Point(138,212)
$secretBox.Size = New-Object System.Drawing.Size(476,30)
$secretBox.UseSystemPasswordChar = $true
$secretBox.TabIndex = 3
$form.Controls.Add($secretBox)

$showSecret = New-Object System.Windows.Forms.CheckBox
$showSecret.Text = '显示密码'
$showSecret.Location = New-Object System.Drawing.Point(138,250)
$showSecret.Size = New-Object System.Drawing.Size(180,28)
$showSecret.TabIndex = 4
$showSecret.Add_CheckedChanged({ $secretBox.UseSystemPasswordChar = -not $showSecret.Checked })
$form.Controls.Add($showSecret)

$statusLabel = Add-JiraLabel '登录信息不会发送到聊天。验证成功后在本机加密保存。' 292 590
$statusLabel.Size = New-Object System.Drawing.Size(590,70)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(75,85,99)

$loginButton = New-Object System.Windows.Forms.Button
$loginButton.Text = '登录并继续'
$loginButton.Location = New-Object System.Drawing.Point(374,382)
$loginButton.Size = New-Object System.Drawing.Size(132,36)
$loginButton.TabIndex = 5
$form.Controls.Add($loginButton)
$cancelButton = New-Object System.Windows.Forms.Button
$cancelButton.Text = '取消'
$cancelButton.Location = New-Object System.Drawing.Point(518,382)
$cancelButton.Size = New-Object System.Drawing.Size(96,36)
$cancelButton.TabIndex = 6
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelButton)
$form.AcceptButton = $loginButton
$form.CancelButton = $cancelButton

function Reset-JiraAttempt {
    if ($null -ne $script:requestMessage) { $script:requestMessage.Dispose() }
    if ($null -ne $script:attemptSecret) { $script:attemptSecret.Dispose() }
    $script:requestMessage = $null
    $script:attemptSecret = $null
    $script:pendingRequest = $null
    $script:attemptContext = $null
}

function Set-JiraBusy {
    param([bool]$Busy)
    $addressBox.Enabled = -not $Busy
    $modeBox.Enabled = -not $Busy
    $usernameBox.Enabled = (-not $Busy) -and $modeBox.SelectedIndex -eq 0
    $secretBox.Enabled = -not $Busy
    $showSecret.Enabled = -not $Busy
    $loginButton.Enabled = -not $Busy
    $form.UseWaitCursor = $Busy
    $loginButton.Text = if ($Busy) { '正在验证…' } else { '登录并继续' }
}

$modeBox.Add_SelectedIndexChanged({
    $secretBox.Clear()
    $showSecret.Checked = $false
    $isToken = $modeBox.SelectedIndex -eq 1
    $usernameBox.Enabled = -not $isToken
    $secretLabel.Text = if ($isToken) { 'Token 令牌' } else { '登录密码' }
    $showSecret.Text = if ($isToken) { '显示令牌' } else { '显示密码' }
    $statusLabel.Text = if ($isToken) {
        '填写个人访问令牌即可，账号由 Jira 验证后识别。'
    } else {
        '填写账号和密码。验证成功后在本机加密保存。'
    }
})
$addressBox.Add_TextChanged({
    $secretBox.Clear()
    $statusLabel.Text = '网址已更改，请为该网站填写登录信息。'
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
    if ($null -eq $script:pendingRequest -or -not $script:pendingRequest.IsCompleted) { return }
    $timer.Stop()
    $response = $null
    try {
        $response = $script:pendingRequest.GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            $statusCode = [int]$response.StatusCode
            $statusLabel.Text = switch ($statusCode) {
                401 { '登录未通过，请检查账号密码或令牌。请勿将 Token 填在密码方式中。' }
                403 { 'Jira 拒绝了该登录请求。请检查账号权限或在网站处理登录限制。' }
                404 { '未找到 Jira 接口，请检查网址是否包含正确的端口和应用路径。' }
                429 { '请求过于频繁，请稍后再试。' }
                default { 'Jira 返回 HTTP ' + $statusCode + '，本次未保存配置。' }
            }
            return
        }
        $identity = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace($identity.name) -or $identity.active -ne $true) {
            $statusLabel.Text = '未能确认有效的 Jira 登录身份，请检查网址和登录信息。'
            return
        }
        $stateRoot = [IO.Path]::GetFullPath($StateDirectory)
        $profile = [ordered]@{
            base_url = $script:attemptContext.base_url
            username = $identity.name
            auth_mode = $script:attemptContext.auth_mode
            auth_username = $script:attemptContext.username
            secret = (New-Object System.Management.Automation.PSCredential('jira-secret',$script:attemptSecret)).GetNetworkCredential().Password
        }
        $saved = $false
        $statePath = $null
        try {
            [void](New-Item -ItemType Directory -Path $stateRoot -Force)
            $profilePath = Join-Path $stateRoot 'connection.bin'
            $plainBytes = [Text.Encoding]::UTF8.GetBytes(($profile | ConvertTo-Json -Compress))
            try { $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($plainBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) } finally { [Array]::Clear($plainBytes,0,$plainBytes.Length) }
            $temporaryPath = Join-Path $stateRoot ([Guid]::NewGuid().ToString('N') + '.tmp')
            [IO.File]::WriteAllBytes($temporaryPath,$protectedBytes)
            if (Test-Path -LiteralPath $profilePath) { [IO.File]::Replace($temporaryPath,$profilePath,[System.Management.Automation.Language.NullString]::Value) } else { [IO.File]::Move($temporaryPath,$profilePath) }
            $statePath = $profilePath
            $saved = $true
        } catch {
            $statePath = $null
        }
        $script:loginResult = [ordered]@{
            status = 'authenticated'
            saved = $saved
            base_url = $profile.base_url
            username = $identity.name
            display_name = $identity.displayName
            auth_mode = $profile.auth_mode
            state_path = $statePath
        }
        $profile.secret = $null
        $secretBox.Clear()
        $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $form.Close()
    } catch {
        $statusLabel.Text = '连接超时、网络异常或返回内容无法识别。请检查网址和网络后重试。'
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        Reset-JiraAttempt
        Set-JiraBusy $false
    }
})

$loginButton.Add_Click({
    try { $requestBase = Get-JiraBaseUrl $addressBox.Text } catch {
        $statusLabel.Text = '请填写有效的网址，不包含账号、密码、查询参数或片段。'
        return
    }
    if ([string]::IsNullOrEmpty($secretBox.Text)) {
        $statusLabel.Text = if ($modeBox.SelectedIndex -eq 1) { '请填写 Token 令牌。' } else { '请填写登录密码。' }
        return
    }
    $isToken = $modeBox.SelectedIndex -eq 1
    if (-not $isToken -and ([string]::IsNullOrWhiteSpace($usernameBox.Text) -or $usernameBox.Text.Contains(':'))) {
        $statusLabel.Text = '请填写有效的登录账号。'
        return
    }
    try {
        $secretValue = if ($isToken) { $secretBox.Text.Trim() } else { $secretBox.Text }
        $script:attemptSecret = ConvertTo-SecureString -String $secretValue -AsPlainText -Force
        $script:attemptContext = @{ base_url = $requestBase; auth_mode = $(if ($isToken) { 'token' } else { 'password' }); username = $usernameBox.Text.Trim() }
        $script:requestMessage = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, ($requestBase + '/rest/api/2/myself'))
        if ($isToken) {
            $script:requestMessage.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer',$secretValue)
        } else {
            $authBytes = [Text.Encoding]::UTF8.GetBytes($usernameBox.Text.Trim() + ':' + $secretValue)
            try {
                $script:requestMessage.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Basic',[Convert]::ToBase64String($authBytes))
            } finally {
                [Array]::Clear($authBytes,0,$authBytes.Length)
            }
        }
        $secretValue = $null
        Set-JiraBusy $true
        $statusLabel.Text = '正在验证登录身份…'
        $script:pendingRequest = $script:httpClient.SendAsync($script:requestMessage)
        $timer.Start()
    } catch {
        Reset-JiraAttempt
        Set-JiraBusy $false
        $statusLabel.Text = '无法发起登录，请检查所填内容后重试。'
    } finally {
        $secretValue = $null
    }
})

$form.Add_Shown({
    $form.Activate()
    if ($modeBox.SelectedIndex -eq 1) { [void]$loginButton.Focus() } else { [void]$usernameBox.Focus() }
})
$form.Add_FormClosing({ $timer.Stop(); $script:httpClient.CancelPendingRequests() })
try {
    [void]$form.ShowDialog()
} finally {
    $secretBox.Clear()
    $timer.Dispose()
    Reset-JiraAttempt
    $script:httpClient.Dispose()
    $httpHandler.Dispose()
    $form.Dispose()
}
$script:loginResult | ConvertTo-Json -Compress
