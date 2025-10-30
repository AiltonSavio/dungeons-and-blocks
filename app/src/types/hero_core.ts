/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/hero_core.json`.
 */
export type HeroCore = {
  "address": "B8KfNvRUoNbF7FPeuDdZ7nfjPXz6kAex4Pye6GcpLD1E",
  "metadata": {
    "name": "heroCore",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "applyBlessing",
      "discriminator": [
        182,
        182,
        226,
        188,
        88,
        142,
        63,
        143
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "applyStatusEffect",
      "discriminator": [
        115,
        194,
        95,
        142,
        223,
        57,
        136,
        211
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "effectType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "burnHero",
      "discriminator": [
        51,
        232,
        158,
        137,
        182,
        112,
        64,
        42
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "callbackLevelUpHero",
      "discriminator": [
        75,
        31,
        142,
        23,
        220,
        72,
        73,
        99
      ],
      "accounts": [
        {
          "name": "programIdentity",
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        },
        {
          "name": "payer"
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "callbackMintHeroFree",
      "discriminator": [
        224,
        186,
        8,
        18,
        235,
        3,
        140,
        196
      ],
      "accounts": [
        {
          "name": "programIdentity",
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player_profile.owner",
                "account": "playerProfile"
              }
            ]
          }
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        },
        {
          "name": "payer"
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "callbackMintHeroPaid",
      "discriminator": [
        81,
        72,
        116,
        74,
        168,
        104,
        0,
        232
      ],
      "accounts": [
        {
          "name": "programIdentity",
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player_profile.owner",
                "account": "playerProfile"
              }
            ]
          }
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        },
        {
          "name": "payer"
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "callbackRerollStats",
      "discriminator": [
        24,
        134,
        156,
        127,
        235,
        95,
        145,
        179
      ],
      "accounts": [
        {
          "name": "programIdentity",
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        },
        {
          "name": "payer"
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "cureNegativeTrait",
      "discriminator": [
        184,
        47,
        240,
        204,
        185,
        36,
        125,
        247
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "traitIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "cureStatusEffect",
      "discriminator": [
        148,
        109,
        211,
        115,
        188,
        242,
        207,
        194
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "effectType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "damageHero",
      "discriminator": [
        148,
        226,
        43,
        187,
        219,
        94,
        134,
        209
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u8"
        }
      ]
    },
    {
      "name": "grantExperience",
      "discriminator": [
        207,
        8,
        29,
        155,
        166,
        199,
        151,
        39
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "grantNegativeTrait",
      "discriminator": [
        224,
        167,
        223,
        109,
        73,
        103,
        118,
        248
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "traitId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "grantStatusEffect",
      "discriminator": [
        109,
        234,
        227,
        249,
        202,
        103,
        148,
        249
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "effectType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "healHero",
      "discriminator": [
        231,
        106,
        166,
        17,
        26,
        207,
        125,
        103
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initializePlayer",
      "discriminator": [
        79,
        249,
        88,
        177,
        220,
        62,
        56,
        128
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "levelUpHero",
      "discriminator": [
        190,
        123,
        111,
        190,
        184,
        74,
        34,
        137
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "lockForAdventure",
      "discriminator": [
        155,
        54,
        152,
        75,
        15,
        169,
        114,
        91
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        },
        {
          "name": "adventureSigner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "adventurePda",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "mintHeroFree",
      "discriminator": [
        26,
        28,
        214,
        62,
        10,
        87,
        144,
        66
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "player_profile.next_hero_id",
                "account": "playerProfile"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mintHeroPaid",
      "discriminator": [
        157,
        18,
        206,
        107,
        36,
        236,
        5,
        91
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "player_profile.next_hero_id",
                "account": "playerProfile"
              }
            ]
          }
        },
        {
          "name": "gameVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "playerEconomyAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                112,
                43,
                28,
                176,
                121,
                72,
                141,
                186,
                57,
                239,
                160,
                40,
                144,
                249,
                121,
                197,
                66,
                214,
                20,
                170,
                22,
                176,
                219,
                21,
                252,
                153,
                153,
                123,
                191,
                230,
                24,
                124
              ]
            }
          }
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mintHeroWithSeed",
      "discriminator": [
        100,
        33,
        98,
        128,
        197,
        193,
        167,
        135
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "address": "AXwYStYVryJuZjNJjHHLPp6eVRc2TuESnW1pCMiUYrwV"
        },
        {
          "name": "owner"
        },
        {
          "name": "playerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "player_profile.next_hero_id",
                "account": "playerProfile"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        },
        {
          "name": "seed",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "isSoulbound",
          "type": "bool"
        }
      ]
    },
    {
      "name": "relieveStress",
      "discriminator": [
        41,
        155,
        34,
        175,
        206,
        193,
        142,
        126
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "removeStatusEffect",
      "discriminator": [
        65,
        224,
        113,
        42,
        21,
        229,
        211,
        192
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        },
        {
          "name": "effectType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "rerollStats",
      "discriminator": [
        96,
        34,
        45,
        51,
        61,
        111,
        65,
        198
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "heroId"
              }
            ]
          }
        },
        {
          "name": "playerEconomy",
          "writable": true
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "heroId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "syncStatsFromAdventure",
      "discriminator": [
        191,
        3,
        47,
        251,
        16,
        94,
        217,
        110
      ],
      "accounts": [
        {
          "name": "adventureSigner",
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "heroState",
          "type": {
            "defined": {
              "name": "adventureHeroStats"
            }
          }
        }
      ]
    },
    {
      "name": "unlockFromAdventure",
      "discriminator": [
        241,
        72,
        139,
        70,
        121,
        75,
        25,
        201
      ],
      "accounts": [
        {
          "name": "player",
          "signer": true
        },
        {
          "name": "heroMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  101,
                  114,
                  111
                ]
              },
              {
                "kind": "account",
                "path": "hero_mint.owner",
                "account": "heroMint"
              },
              {
                "kind": "account",
                "path": "hero_mint.id",
                "account": "heroMint"
              }
            ]
          }
        },
        {
          "name": "adventureSigner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "adventurePda",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "gameVault",
      "discriminator": [
        152,
        194,
        238,
        3,
        140,
        24,
        51,
        32
      ]
    },
    {
      "name": "heroMint",
      "discriminator": [
        202,
        83,
        95,
        67,
        120,
        234,
        56,
        187
      ]
    },
    {
      "name": "playerEconomy",
      "discriminator": [
        13,
        211,
        131,
        77,
        0,
        34,
        150,
        149
      ]
    },
    {
      "name": "playerProfile",
      "discriminator": [
        82,
        226,
        99,
        87,
        164,
        130,
        181,
        80
      ]
    }
  ],
  "events": [
    {
      "name": "experienceGranted",
      "discriminator": [
        50,
        90,
        99,
        216,
        51,
        74,
        75,
        202
      ]
    },
    {
      "name": "heroBlessed",
      "discriminator": [
        69,
        109,
        3,
        189,
        223,
        151,
        21,
        52
      ]
    },
    {
      "name": "heroBurned",
      "discriminator": [
        216,
        98,
        168,
        248,
        68,
        177,
        172,
        184
      ]
    },
    {
      "name": "heroDamaged",
      "discriminator": [
        21,
        188,
        188,
        141,
        18,
        30,
        3,
        103
      ]
    },
    {
      "name": "heroHealed",
      "discriminator": [
        158,
        57,
        41,
        82,
        149,
        105,
        112,
        215
      ]
    },
    {
      "name": "heroLeveledUp",
      "discriminator": [
        228,
        107,
        148,
        124,
        139,
        29,
        247,
        148
      ]
    },
    {
      "name": "heroLockedEvent",
      "discriminator": [
        30,
        3,
        168,
        160,
        215,
        46,
        150,
        145
      ]
    },
    {
      "name": "heroMinted",
      "discriminator": [
        157,
        207,
        42,
        108,
        87,
        16,
        73,
        63
      ]
    },
    {
      "name": "heroUnlockedEvent",
      "discriminator": [
        131,
        224,
        143,
        46,
        201,
        23,
        13,
        66
      ]
    },
    {
      "name": "negativeTraitGranted",
      "discriminator": [
        23,
        38,
        190,
        146,
        6,
        194,
        182,
        254
      ]
    },
    {
      "name": "playerInitialized",
      "discriminator": [
        214,
        37,
        153,
        142,
        63,
        109,
        206,
        15
      ]
    },
    {
      "name": "randomnessRequested",
      "discriminator": [
        10,
        64,
        183,
        29,
        104,
        63,
        90,
        149
      ]
    },
    {
      "name": "statsRerolled",
      "discriminator": [
        121,
        195,
        212,
        11,
        68,
        52,
        197,
        78
      ]
    },
    {
      "name": "statusEffectApplied",
      "discriminator": [
        69,
        239,
        2,
        66,
        141,
        216,
        12,
        234
      ]
    },
    {
      "name": "statusEffectGranted",
      "discriminator": [
        125,
        131,
        47,
        39,
        54,
        146,
        94,
        184
      ]
    },
    {
      "name": "statusEffectRemoved",
      "discriminator": [
        211,
        14,
        26,
        123,
        137,
        157,
        158,
        239
      ]
    },
    {
      "name": "stressRelieved",
      "discriminator": [
        101,
        190,
        183,
        148,
        6,
        6,
        241,
        37
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "missingBump",
      "msg": "Missing PDA bump value"
    },
    {
      "code": 6001,
      "name": "freeMintsExhausted",
      "msg": "Player already used all free hero mints"
    },
    {
      "code": 6002,
      "name": "heroCapacityReached",
      "msg": "Player reached maximum hero capacity"
    },
    {
      "code": 6003,
      "name": "insufficientGold",
      "msg": "Insufficient gold for paid mint"
    },
    {
      "code": 6004,
      "name": "mathOverflow",
      "msg": "Math overflow detected"
    },
    {
      "code": 6005,
      "name": "unexpectedCallback",
      "msg": "Unexpected randomness callback"
    },
    {
      "code": 6006,
      "name": "heroBurned",
      "msg": "Hero already burned"
    },
    {
      "code": 6007,
      "name": "unauthorizedOwner",
      "msg": "Unauthorized hero owner"
    },
    {
      "code": 6008,
      "name": "invalidVrfIdentity",
      "msg": "Invalid VRF identity signer"
    },
    {
      "code": 6009,
      "name": "heroMismatch",
      "msg": "Hero account mismatch"
    },
    {
      "code": 6010,
      "name": "heroBusy",
      "msg": "Hero already processing a randomness request"
    },
    {
      "code": 6011,
      "name": "maxLevelReached",
      "msg": "Hero reached maximum level"
    },
    {
      "code": 6012,
      "name": "insufficientExperience",
      "msg": "Hero does not meet experience requirement for level up"
    },
    {
      "code": 6013,
      "name": "invalidLevelProgression",
      "msg": "Invalid level progression requested"
    },
    {
      "code": 6014,
      "name": "invalidStatusEffect",
      "msg": "Invalid status effect type"
    },
    {
      "code": 6015,
      "name": "heroLocked",
      "msg": "Hero is locked in an adventure"
    },
    {
      "code": 6016,
      "name": "wrongAdventure",
      "msg": "Adventure signer mismatch"
    },
    {
      "code": 6017,
      "name": "wrongProgram",
      "msg": "Adventure program mismatch"
    },
    {
      "code": 6018,
      "name": "notLocked",
      "msg": "Hero is not locked"
    },
    {
      "code": 6019,
      "name": "alreadyLocked",
      "msg": "Hero already locked"
    },
    {
      "code": 6020,
      "name": "unauthorizedAuthority",
      "msg": "Seeded mint authority mismatch"
    },
    {
      "code": 6021,
      "name": "noStatusEffects",
      "msg": "No status effects to cure"
    },
    {
      "code": 6022,
      "name": "noNegativeTraits",
      "msg": "No negative traits to cure"
    },
    {
      "code": 6023,
      "name": "maxRerollsReached",
      "msg": "Hero has reached maximum reroll limit"
    },
    {
      "code": 6024,
      "name": "noStressToRelieve",
      "msg": "Hero stress is already at zero"
    },
    {
      "code": 6025,
      "name": "alreadyBlessed",
      "msg": "Hero is already blessed"
    },
    {
      "code": 6026,
      "name": "invalidNegativeTrait",
      "msg": "Invalid negative trait"
    },
    {
      "code": 6027,
      "name": "negativeTraitSlotsFull",
      "msg": "All negative trait slots are filled"
    },
    {
      "code": 6028,
      "name": "heroAtMaxHp",
      "msg": "Hero is already at maximum HP"
    },
    {
      "code": 6029,
      "name": "invalidHealAmount",
      "msg": "Invalid heal amount"
    },
    {
      "code": 6030,
      "name": "healAmountTooLarge",
      "msg": "Heal amount exceeds missing HP"
    }
  ],
  "types": [
    {
      "name": "adventureHeroStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "heroType",
            "type": "u8"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "experience",
            "type": "u64"
          },
          {
            "name": "maxHp",
            "type": "u8"
          },
          {
            "name": "currentHp",
            "type": "u8"
          },
          {
            "name": "attack",
            "type": "u8"
          },
          {
            "name": "defense",
            "type": "u8"
          },
          {
            "name": "magic",
            "type": "u8"
          },
          {
            "name": "resistance",
            "type": "u8"
          },
          {
            "name": "speed",
            "type": "u8"
          },
          {
            "name": "luck",
            "type": "u8"
          },
          {
            "name": "statusEffects",
            "type": "u8"
          },
          {
            "name": "stress",
            "type": "u16"
          },
          {
            "name": "stressMax",
            "type": "u16"
          },
          {
            "name": "positiveTraits",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "negativeTraits",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "experienceGranted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalExperience",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gameVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "heroBlessed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "heroBurned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "heroDamaged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u8"
          },
          {
            "name": "remainingHp",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "heroHealed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u8"
          },
          {
            "name": "goldSpent",
            "type": "u64"
          },
          {
            "name": "resultingHp",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "heroLeveledUp",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "newLevel",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "heroLockedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "adventure",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "heroMint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "heroType",
            "type": "u8"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "experience",
            "type": "u64"
          },
          {
            "name": "maxHp",
            "type": "u8"
          },
          {
            "name": "currentHp",
            "type": "u8"
          },
          {
            "name": "attack",
            "type": "u8"
          },
          {
            "name": "defense",
            "type": "u8"
          },
          {
            "name": "magic",
            "type": "u8"
          },
          {
            "name": "resistance",
            "type": "u8"
          },
          {
            "name": "speed",
            "type": "u8"
          },
          {
            "name": "luck",
            "type": "u8"
          },
          {
            "name": "statusEffects",
            "type": "u8"
          },
          {
            "name": "skill1",
            "type": {
              "defined": {
                "name": "skill"
              }
            }
          },
          {
            "name": "skill2",
            "type": {
              "defined": {
                "name": "skill"
              }
            }
          },
          {
            "name": "positiveTraits",
            "type": {
              "array": [
                {
                  "option": "u8"
                },
                3
              ]
            }
          },
          {
            "name": "negativeTraits",
            "type": {
              "array": [
                {
                  "option": "u8"
                },
                3
              ]
            }
          },
          {
            "name": "isSoulbound",
            "type": "bool"
          },
          {
            "name": "isBurned",
            "type": "bool"
          },
          {
            "name": "mintTimestamp",
            "type": "i64"
          },
          {
            "name": "lastLevelUp",
            "type": "i64"
          },
          {
            "name": "pendingRequest",
            "type": "u8"
          },
          {
            "name": "locked",
            "type": "bool"
          },
          {
            "name": "lockedAdventure",
            "type": "pubkey"
          },
          {
            "name": "lockedProgram",
            "type": "pubkey"
          },
          {
            "name": "lockedSince",
            "type": "i64"
          },
          {
            "name": "stress",
            "type": "u16"
          },
          {
            "name": "stressMax",
            "type": "u16"
          },
          {
            "name": "rerollCount",
            "type": "u8"
          },
          {
            "name": "blessed",
            "type": "bool"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                25
              ]
            }
          }
        ]
      }
    },
    {
      "name": "heroMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "heroType",
            "type": "u8"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "isSoulbound",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "heroUnlockedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "adventure",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "negativeTraitGranted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "traitId",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "playerEconomy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "gold",
            "type": "u64"
          },
          {
            "name": "lastGrantTs",
            "type": "i64"
          },
          {
            "name": "items",
            "type": {
              "array": [
                "u16",
                7
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          }
        ]
      }
    },
    {
      "name": "playerInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "playerProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "heroCount",
            "type": "u8"
          },
          {
            "name": "freeMintsClaimed",
            "type": "bool"
          },
          {
            "name": "freeMintCount",
            "type": "u8"
          },
          {
            "name": "nextHeroId",
            "type": "u64"
          },
          {
            "name": "soulboundHeroIds",
            "type": {
              "array": [
                {
                  "option": "u64"
                },
                4
              ]
            }
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "randomnessRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "requestType",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "skill",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "statsRerolled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "rerollCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "statusEffectApplied",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "effectType",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "statusEffectGranted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "effectType",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "statusEffectRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "effectType",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "stressRelieved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "heroId",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
