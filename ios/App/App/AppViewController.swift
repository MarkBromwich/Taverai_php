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

    // WKWebView sometimes finishes its own rotation animation without ever
    // re-evaluating CSS orientation media queries against the new size,
    // leaving the page stuck showing the old (e.g. landscape) layout after
    // rotating back to portrait. Nudging it with a resize event once the
    // native rotation transition completes forces it to re-check.
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new Event('resize'));", completionHandler: nil)
        }
    }

    private func applyDarkWebViewBackground() {
        view.backgroundColor = appBackground
        webView?.isOpaque = false
        webView?.backgroundColor = appBackground
        webView?.scrollView.backgroundColor = appBackground
        webView?.scrollView.subviews.forEach { $0.backgroundColor = appBackground }
    }
}
