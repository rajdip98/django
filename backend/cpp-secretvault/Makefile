# Build:  make            (needs g++ and libssl-dev / openssl-devel)
# Debian/Ubuntu:  sudo apt install g++ libssl-dev
# Fedora/RHEL:    sudo dnf install gcc-c++ openssl-devel
# macOS:          brew install openssl@3   (then: make OPENSSL=$(brew --prefix openssl@3))

CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic -fstack-protector-strong \
            -D_FORTIFY_SOURCE=2
LDFLAGS  ?=
LDLIBS   ?= -lcrypto

ifdef OPENSSL
CXXFLAGS += -I$(OPENSSL)/include
LDFLAGS  += -L$(OPENSSL)/lib
endif

secretvault: secretvault.cpp
	$(CXX) $(CXXFLAGS) -o $@ $< $(LDFLAGS) $(LDLIBS)

test: secretvault
	./run_tests.sh

install: secretvault
	install -m 0755 secretvault /usr/local/bin/secretvault

clean:
	rm -f secretvault

.PHONY: test install clean
