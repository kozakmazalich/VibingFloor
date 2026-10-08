package com.robotfall.arena

import android.net.Uri
import android.util.Base64
import androidx.lifecycle.lifecycleScope
import com.funkatronics.encoders.Base58
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.clientlib.successPayload
import kotlinx.coroutines.launch

/**
 * Bridge between the Capacitor WebView and Solana Mobile Wallet Adapter
 * (Seed Vault / any MWA wallet) using the official Kotlin clientlib.
 *
 * JS surface (window.Capacitor.Plugins.MwaPlugin):
 *   connect() -> { ok, address | reason }
 *   signMessage({ address, payloadBase64 }) -> { ok, signatureBase64 | reason }
 */
@CapacitorPlugin(name = "MwaPlugin")
class MwaPlugin : Plugin() {

    private val walletAdapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse("https://vibingfloor.app"),
            iconUri = Uri.parse("favicon.ico"),
            identityName = "VIBING FLOOR",
        ),
    )

    // Cached session state: address (base58, for the HUD) and its raw bytes for signing
    private var cachedAddress = ""
    private var cachedAddressBytes: ByteArray? = null

    @PluginMethod
    fun connect(call: PluginCall) {
        val activity = bridge.activity ?: return call.reject("No activity available")
        activity.lifecycleScope.launch {
            val sender = ActivityResultSender(activity)
            when (val result = walletAdapter.connect(sender)) {
                is TransactionResult.Success -> {
                    val account = result.authResult.accounts.firstOrNull()
                    val bytes = account?.publicKey
                    val address = bytes?.let { Base58.encodeToString(it) } ?: ""
                    cachedAddress = address
                    cachedAddressBytes = bytes
                    val ret = JSObject()
                    ret.put("ok", address.isNotEmpty())
                    ret.put("address", address)
                    call.resolve(ret)
                }
                is TransactionResult.NoWalletFound -> {
                    call.resolve(errorResult("no-wallet"))
                }
                is TransactionResult.Failure -> {
                    call.resolve(errorResult(result.message ?: "Wallet rejected the connection"))
                }
            }
        }
    }

    @PluginMethod
    fun signMessage(call: PluginCall) {
        val address = call.getString("address") ?: return call.reject("address is required")
        val payloadBase64 = call.getString("payloadBase64") ?: return call.reject("payloadBase64 is required")
        val payload = try {
            Base64.decode(payloadBase64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            return call.reject("payloadBase64 is not valid base64")
        }
        val addressBytes = cachedAddressBytes
        if (address != cachedAddress || addressBytes == null) {
            return call.reject("Wallet not connected; call connect first")
        }

        val activity = bridge.activity ?: return call.reject("No activity available")
        activity.lifecycleScope.launch {
            val sender = ActivityResultSender(activity)
            when (val result = walletAdapter.transact(sender) { authResult ->
                signMessagesDetached(arrayOf(payload), arrayOf(addressBytes))
            }) {
                is TransactionResult.Success -> {
                    val signature = result.successPayload
                        ?.messages?.firstOrNull()
                        ?.signatures?.firstOrNull()
                    val ret = JSObject()
                    if (signature != null) {
                        ret.put("ok", true)
                        ret.put("signatureBase64", Base64.encodeToString(signature, Base64.NO_WRAP))
                    } else {
                        ret.put("ok", false)
                        ret.put("reason", "Wallet returned no signature")
                    }
                    call.resolve(ret)
                }
                is TransactionResult.NoWalletFound -> {
                    call.resolve(errorResult("no-wallet"))
                }
                is TransactionResult.Failure -> {
                    call.resolve(errorResult(result.message ?: "Signing failed"))
                }
            }
        }
    }

    private fun errorResult(reason: String): JSObject {
        val ret = JSObject()
        ret.put("ok", false)
        ret.put("reason", reason)
        return ret
    }
}
