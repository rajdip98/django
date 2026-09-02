// secretvault — keeps API keys and passwords encrypted at rest.
//
// What this protects against
//   * secrets sitting in plaintext in settings.py, a .env file, a git repository,
//     a backup tarball or a disk image
//   * someone reading the deployment directory without knowing the passphrase
//
// What it cannot protect against, and no program can
//   * an attacker who is root on the running server: the decrypted value is in the
//     application's memory while it runs
//   * anyone who has both the vault file and the passphrase
//
// A compiled binary is not a hiding place. Nothing secret is stored in this
// program — the ciphertext lives in the vault file and the key is derived from a
// passphrase you supply at run time.
//
// Crypto: AES-256-GCM (authenticated, so tampering is detected), one random
// 96-bit nonce per entry, key derived with PBKDF2-HMAC-SHA256 over a random
// 128-bit salt. OpenSSL 3 does the primitives; none are hand-rolled.
//
// Build:  make          (needs g++ and libssl-dev)
// Usage:  ./secretvault help

#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/err.h>

#include <algorithm>
#include <cstring>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#include <termios.h>
#include <unistd.h>
#include <sys/stat.h>

namespace {

constexpr int kKeyBytes = 32;      // AES-256
constexpr int kNonceBytes = 12;    // GCM standard nonce
constexpr int kTagBytes = 16;
constexpr int kSaltBytes = 16;
constexpr int kIterations = 600000;  // OWASP guidance for PBKDF2-HMAC-SHA256
constexpr char kMagic[] = "SVLT1";

using Bytes = std::vector<unsigned char>;

void wipe(Bytes& data) {
    if (!data.empty()) OPENSSL_cleanse(data.data(), data.size());
    data.clear();
}

void wipe(std::string& text) {
    if (!text.empty()) OPENSSL_cleanse(&text[0], text.size());
    text.clear();
}

[[noreturn]] void fail(const std::string& message) {
    std::cerr << "secretvault: " << message << '\n';
    std::exit(1);
}

Bytes random_bytes(int count) {
    Bytes out(static_cast<size_t>(count));
    if (RAND_bytes(out.data(), count) != 1) fail("the system random source failed");
    return out;
}

// ---------------------------------------------------------------- encoding

const char* kHex = "0123456789abcdef";

std::string to_hex(const Bytes& data) {
    std::string out;
    out.reserve(data.size() * 2);
    for (unsigned char byte : data) {
        out.push_back(kHex[byte >> 4]);
        out.push_back(kHex[byte & 0x0f]);
    }
    return out;
}

Bytes from_hex(const std::string& text) {
    if (text.size() % 2 != 0) fail("the vault file is corrupt (odd-length field)");
    Bytes out;
    out.reserve(text.size() / 2);
    for (size_t i = 0; i < text.size(); i += 2) {
        auto value = [](char c) -> int {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        };
        int hi = value(text[i]), lo = value(text[i + 1]);
        if (hi < 0 || lo < 0) fail("the vault file is corrupt (bad hex)");
        out.push_back(static_cast<unsigned char>((hi << 4) | lo));
    }
    return out;
}

// ------------------------------------------------------------------ crypto

Bytes derive_key(const std::string& passphrase, const Bytes& salt) {
    Bytes key(kKeyBytes);
    if (PKCS5_PBKDF2_HMAC(passphrase.c_str(), static_cast<int>(passphrase.size()),
                          salt.data(), static_cast<int>(salt.size()), kIterations,
                          EVP_sha256(), kKeyBytes, key.data()) != 1) {
        fail("could not derive the key from the passphrase");
    }
    return key;
}

Bytes encrypt(const Bytes& key, const Bytes& nonce, const std::string& plaintext,
              Bytes& tag_out) {
    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) fail("could not start the cipher");

    Bytes out(plaintext.size() + kTagBytes);
    int length = 0, total = 0;
    bool ok = EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1
        && EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, kNonceBytes, nullptr) == 1
        && EVP_EncryptInit_ex(ctx, nullptr, nullptr, key.data(), nonce.data()) == 1
        && EVP_EncryptUpdate(ctx, out.data(), &length,
                             reinterpret_cast<const unsigned char*>(plaintext.data()),
                             static_cast<int>(plaintext.size())) == 1;
    total = length;
    ok = ok && EVP_EncryptFinal_ex(ctx, out.data() + total, &length) == 1;
    total += length;
    tag_out.assign(kTagBytes, 0);
    ok = ok && EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, kTagBytes, tag_out.data()) == 1;
    EVP_CIPHER_CTX_free(ctx);
    if (!ok) fail("encryption failed");
    out.resize(static_cast<size_t>(total));
    return out;
}

bool decrypt(const Bytes& key, const Bytes& nonce, const Bytes& ciphertext,
             const Bytes& tag, std::string& plaintext_out) {
    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) fail("could not start the cipher");

    Bytes out(ciphertext.size() + kTagBytes);
    int length = 0, total = 0;
    bool ok = EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr) == 1
        && EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, kNonceBytes, nullptr) == 1
        && EVP_DecryptInit_ex(ctx, nullptr, nullptr, key.data(), nonce.data()) == 1
        && EVP_DecryptUpdate(ctx, out.data(), &length, ciphertext.data(),
                             static_cast<int>(ciphertext.size())) == 1;
    total = length;
    ok = ok && EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, kTagBytes,
                                   const_cast<unsigned char*>(tag.data())) == 1;
    // A wrong passphrase or a tampered file fails here, not silently.
    int final_ok = ok ? EVP_DecryptFinal_ex(ctx, out.data() + total, &length) : 0;
    EVP_CIPHER_CTX_free(ctx);
    if (!ok || final_ok != 1) {
        wipe(out);
        return false;
    }
    total += length;
    plaintext_out.assign(reinterpret_cast<char*>(out.data()), static_cast<size_t>(total));
    wipe(out);
    return true;
}

// ------------------------------------------------------------------- vault

struct Entry {
    Bytes nonce;
    Bytes ciphertext;
    Bytes tag;
};

struct Vault {
    Bytes salt;
    std::map<std::string, Entry> entries;
};

std::string vault_path() {
    const char* from_env = std::getenv("SECRETVAULT_FILE");
    if (from_env && *from_env) return from_env;
    return "secrets.vault";
}

bool vault_exists() {
    std::ifstream file(vault_path());
    return file.good();
}

Vault read_vault() {
    std::ifstream file(vault_path());
    if (!file) fail("no vault here. Run 'secretvault init' first.");

    Vault vault;
    std::string line;
    bool header_seen = false;
    while (std::getline(file, line)) {
        if (line.empty() || line[0] == '#') continue;
        std::istringstream parts(line);
        std::string kind;
        parts >> kind;
        if (kind == kMagic) {
            std::string salt_hex;
            parts >> salt_hex;
            vault.salt = from_hex(salt_hex);
            header_seen = true;
        } else if (kind == "entry") {
            std::string name, nonce_hex, tag_hex, cipher_hex;
            parts >> name >> nonce_hex >> tag_hex >> cipher_hex;
            if (name.empty() || cipher_hex.empty()) fail("the vault file is corrupt");
            vault.entries[name] = Entry{from_hex(nonce_hex), from_hex(cipher_hex),
                                       from_hex(tag_hex)};
        }
    }
    if (!header_seen) fail("the vault file is corrupt (no header)");
    return vault;
}

void write_vault(const Vault& vault) {
    const std::string path = vault_path();
    const std::string temp = path + ".tmp";
    {
        std::ofstream file(temp, std::ios::trunc);
        if (!file) fail("cannot write to " + temp);
        file << "# secretvault — encrypted secrets. Safe to commit only if you accept\n"
             << "# that anyone with this file may brute-force a weak passphrase.\n"
             << kMagic << ' ' << to_hex(vault.salt) << '\n';
        for (const auto& [name, entry] : vault.entries) {
            file << "entry " << name << ' ' << to_hex(entry.nonce) << ' '
                 << to_hex(entry.tag) << ' ' << to_hex(entry.ciphertext) << '\n';
        }
    }
    // Readable only by the owner, and replaced atomically.
    if (chmod(temp.c_str(), S_IRUSR | S_IWUSR) != 0) fail("cannot set permissions");
    if (std::rename(temp.c_str(), path.c_str()) != 0) fail("cannot replace the vault file");
}

// -------------------------------------------------------------- passphrase

std::string read_passphrase(const std::string& prompt) {
    const char* from_env = std::getenv("SECRETVAULT_PASSPHRASE");
    if (from_env && *from_env) return from_env;

    if (!isatty(STDIN_FILENO)) {
        fail("no passphrase. Set SECRETVAULT_PASSPHRASE or run this from a terminal.");
    }
    std::cerr << prompt << std::flush;
    termios original{};
    if (tcgetattr(STDIN_FILENO, &original) != 0) fail("cannot read the terminal state");
    termios hidden = original;
    hidden.c_lflag &= ~static_cast<tcflag_t>(ECHO);
    tcsetattr(STDIN_FILENO, TCSAFLUSH, &hidden);
    std::string passphrase;
    std::getline(std::cin, passphrase);
    tcsetattr(STDIN_FILENO, TCSAFLUSH, &original);
    std::cerr << '\n';
    return passphrase;
}

Bytes unlock(const Vault& vault) {
    std::string passphrase = read_passphrase("Passphrase: ");
    if (passphrase.empty()) fail("the passphrase was empty");
    Bytes key = derive_key(passphrase, vault.salt);
    wipe(passphrase);

    // Prove the passphrase before doing anything: decrypt the first entry.
    if (!vault.entries.empty()) {
        const Entry& probe = vault.entries.begin()->second;
        std::string check;
        if (!decrypt(key, probe.nonce, probe.ciphertext, probe.tag, check)) {
            wipe(key);
            fail("wrong passphrase, or the vault file has been altered");
        }
        wipe(check);
    }
    return key;
}

// ---------------------------------------------------------------- commands

int cmd_init() {
    if (vault_exists()) fail(vault_path() + " already exists; refusing to overwrite it");
    std::string first = read_passphrase("Choose a passphrase: ");
    if (first.size() < 12) fail("use at least 12 characters");
    if (!std::getenv("SECRETVAULT_PASSPHRASE")) {
        std::string again = read_passphrase("Repeat it: ");
        if (first != again) fail("the two passphrases do not match");
        wipe(again);
    }
    Vault vault;
    vault.salt = random_bytes(kSaltBytes);
    write_vault(vault);
    wipe(first);
    std::cerr << "Created " << vault_path() << ". Keep the passphrase somewhere safe:\n"
              << "there is no way to recover the contents without it.\n";
    return 0;
}

int cmd_set(const std::string& name) {
    Vault vault = read_vault();
    Bytes key = unlock(vault);

    std::string value;
    if (isatty(STDIN_FILENO)) {
        value = read_passphrase("Value for " + name + ": ");
    } else {
        std::getline(std::cin, value);  // piping in is fine: echo -n key | secretvault set X
    }
    if (value.empty()) { wipe(key); fail("the value was empty"); }

    Entry entry;
    entry.nonce = random_bytes(kNonceBytes);
    entry.ciphertext = encrypt(key, entry.nonce, value, entry.tag);
    vault.entries[name] = entry;
    write_vault(vault);
    wipe(value);
    wipe(key);
    std::cerr << "Stored " << name << ".\n";
    return 0;
}

int cmd_get(const std::string& name) {
    Vault vault = read_vault();
    auto found = vault.entries.find(name);
    if (found == vault.entries.end()) fail("no secret called " + name);
    Bytes key = unlock(vault);
    std::string value;
    if (!decrypt(key, found->second.nonce, found->second.ciphertext, found->second.tag, value)) {
        wipe(key);
        fail("wrong passphrase, or the vault file has been altered");
    }
    wipe(key);
    std::cout << value << '\n';   // stdout carries the secret; stderr carries messages
    wipe(value);
    return 0;
}

int cmd_list() {
    Vault vault = read_vault();
    if (vault.entries.empty()) {
        std::cerr << "The vault is empty.\n";
        return 0;
    }
    for (const auto& [name, entry] : vault.entries) {
        std::cout << name << '\t' << entry.ciphertext.size() << " bytes encrypted\n";
    }
    return 0;
}

int cmd_remove(const std::string& name) {
    Vault vault = read_vault();
    if (vault.entries.erase(name) == 0) fail("no secret called " + name);
    write_vault(vault);
    std::cerr << "Removed " << name << ".\n";
    return 0;
}

int cmd_export() {
    Vault vault = read_vault();
    Bytes key = unlock(vault);
    for (const auto& [name, entry] : vault.entries) {
        std::string value;
        if (!decrypt(key, entry.nonce, entry.ciphertext, entry.tag, value)) {
            wipe(key);
            fail("wrong passphrase, or the vault file has been altered");
        }
        // Quote for the shell: eval "$(secretvault export)"
        std::string quoted;
        for (char c : value) {
            if (c == '\'') quoted += "'\\''";
            else quoted += c;
        }
        std::cout << "export " << name << "='" << quoted << "'\n";
        wipe(value);
    }
    wipe(key);
    return 0;
}

int cmd_rotate() {
    Vault vault = read_vault();
    Bytes old_key = unlock(vault);

    std::map<std::string, std::string> plaintexts;
    for (const auto& [name, entry] : vault.entries) {
        std::string value;
        if (!decrypt(old_key, entry.nonce, entry.ciphertext, entry.tag, value)) {
            wipe(old_key);
            fail("could not read the vault with that passphrase");
        }
        plaintexts[name] = value;
    }
    wipe(old_key);

    // The new passphrase comes from SECRETVAULT_NEW_PASSPHRASE when set, so a
    // scheduled rotation can run unattended; otherwise it is typed twice.
    std::string first;
    const char* scripted = std::getenv("SECRETVAULT_NEW_PASSPHRASE");
    if (scripted && *scripted) {
        first = scripted;
    } else {
        unsetenv("SECRETVAULT_PASSPHRASE");  // do not reuse the old one by accident
        first = read_passphrase("New passphrase: ");
        std::string again = read_passphrase("Repeat it: ");
        if (first != again) fail("the two passphrases do not match");
        wipe(again);
    }
    if (first.size() < 12) fail("use at least 12 characters");

    Vault fresh;
    fresh.salt = random_bytes(kSaltBytes);
    Bytes new_key = derive_key(first, fresh.salt);
    wipe(first);
    for (auto& [name, value] : plaintexts) {
        Entry entry;
        entry.nonce = random_bytes(kNonceBytes);
        entry.ciphertext = encrypt(new_key, entry.nonce, value, entry.tag);
        fresh.entries[name] = entry;
        wipe(value);
    }
    write_vault(fresh);
    wipe(new_key);
    std::cerr << "Re-encrypted " << fresh.entries.size() << " secret(s) under the new passphrase.\n";
    return 0;
}

int cmd_help() {
    std::cerr <<
        "secretvault — keep API keys and passwords encrypted at rest\n\n"
        "  secretvault init                 create a vault (asks for a passphrase)\n"
        "  secretvault set NAME             store a secret (typed, or piped on stdin)\n"
        "  secretvault get NAME             print one secret to stdout\n"
        "  secretvault list                 list the names held (never the values)\n"
        "  secretvault remove NAME          delete a secret\n"
        "  secretvault export               print 'export NAME=value' lines\n"
        "  secretvault rotate               re-encrypt everything under a new passphrase\n\n"
        "Environment:\n"
        "  SECRETVAULT_FILE         vault path (default: ./secrets.vault)\n"
        "  SECRETVAULT_PASSPHRASE   passphrase, for unattended start-up\n"
        "  SECRETVAULT_NEW_PASSPHRASE  the replacement, for an unattended 'rotate'\n\n"
        "AES-256-GCM, PBKDF2-HMAC-SHA256 with 600,000 iterations, random salt and\n"
        "nonce. A wrong passphrase or an edited vault file is detected and refused.\n\n"
        "This does not hide anything from someone who is root on the running machine:\n"
        "the decrypted value is in the application's memory while it runs. It keeps\n"
        "secrets out of your source tree, your .env files and your backups.\n";
    return 0;
}

}  // namespace

int main(int argc, char** argv) {
    const std::vector<std::string> args(argv + 1, argv + argc);
    if (args.empty()) return cmd_help();

    const std::string& command = args[0];
    auto needs_name = [&](const char* what) -> std::string {
        if (args.size() < 2) fail(std::string("which secret? usage: secretvault ") + what + " NAME");
        return args[1];
    };

    if (command == "init") return cmd_init();
    if (command == "set") return cmd_set(needs_name("set"));
    if (command == "get") return cmd_get(needs_name("get"));
    if (command == "list") return cmd_list();
    if (command == "remove") return cmd_remove(needs_name("remove"));
    if (command == "export") return cmd_export();
    if (command == "rotate") return cmd_rotate();
    if (command == "help" || command == "--help" || command == "-h") return cmd_help();

    std::cerr << "secretvault: unknown command '" << command << "'\n\n";
    cmd_help();
    return 1;
}
