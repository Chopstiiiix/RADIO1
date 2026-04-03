import UIKit
import WebKit
import Capacitor

class CustomViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

        // Ensure the WebView's scroll view respects safe area insets
        // so content never slides behind the status bar
        webView?.scrollView.contentInsetAdjustmentBehavior = .always
    }
}
