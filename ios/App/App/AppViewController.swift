import UIKit
import WebKit
import Capacitor

class AppViewController: CAPBridgeViewController {
    private let appBackground = UIColor(red: 0.027, green: 0.051, blue: 0.086, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        applyDarkWebViewBackground()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        applyDarkWebViewBackground()
    }

    private func applyDarkWebViewBackground() {
        view.backgroundColor = appBackground
        webView?.isOpaque = false
        webView?.backgroundColor = appBackground
        webView?.scrollView.backgroundColor = appBackground
        webView?.scrollView.subviews.forEach { $0.backgroundColor = appBackground }
    }
}
