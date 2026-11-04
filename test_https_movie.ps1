# Let's test if https://5tv.store allows video requests or returns an SSL error / 302
$u = "https://5tv.store/movie/test/test/1.mp4"
try {
    $req = [System.Net.HttpWebRequest]::Create($u)
    $req.Timeout = 5000
    $res = $req.GetResponse()
    Write-Output "Status: $($res.StatusCode)"
    $res.Close()
} catch [System.Net.WebException] {
    $r = $_.Exception.Response
    if ($r) {
        Write-Output "WebException: $($r.StatusCode)"
        $r.Close()
    } else {
        Write-Output "WebException: $($_.Exception.Message)"
    }
}
